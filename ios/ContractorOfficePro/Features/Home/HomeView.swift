import SwiftData
import SwiftUI

/// Placeholder home until step 7 adds Clients / Jobs / Settings.
struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase
    let sync: SyncEngine
    @Query private var organizations: [Organization]

    init(orgID: UUID, sync: SyncEngine) {
        self.sync = sync
        _organizations = Query(filter: #Predicate<Organization> { $0.id == orgID })
    }

    var body: some View {
        NavigationStack {
            VStack {
                Image(systemName: "hammer.fill")
                    .font(.largeTitle)
                    .imageScale(.large)
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text(.homeWelcome)
                    .font(.title2.bold())
                if let organization = organizations.first {
                    Text(organization.name)
                        .font(.headline)
                }
                SyncStatusView(sync: sync)
                    .padding(.top)
            }
            .padding()
            .navigationTitle(Text(.appName))
        }
        .task { await sync.run() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { sync.syncSoon(after: 0.5) }
        }
    }
}

struct SyncStatusView: View {
    let sync: SyncEngine

    var body: some View {
        VStack {
            statusLabel
            if sync.pendingCount > 0 {
                Text(.syncPending(count: sync.pendingCount))
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch sync.status {
        case .syncing:
            Label { Text(.syncStatusSyncing) } icon: { Image(systemName: "arrow.triangle.2.circlepath") }
        case .offline:
            Label { Text(.syncStatusOffline) } icon: { Image(systemName: "wifi.slash") }
        case .failed:
            Label { Text(.syncStatusFailed) } icon: { Image(systemName: "exclamationmark.triangle") }
        case .idle:
            if let last = sync.lastSyncedAt {
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    Label {
                        Text(.syncStatusSynced(time: last.formatted(.relative(presentation: .named))))
                    } icon: {
                        Image(systemName: "checkmark.icloud")
                    }
                }
            } else {
                Label { Text(.syncStatusNever) } icon: { Image(systemName: "icloud") }
            }
        }
    }
}

#Preview {
    let (container, session) = PreviewData.ready()
    return RootView().environment(session).modelContainer(container)
}
