import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                ProgressView()
            case .backendMissing:
                ContentUnavailableView("home.backend.missing", systemImage: "exclamationmark.icloud")
            case .signedOut:
                SignInView()
            case .offline:
                ContentUnavailableView {
                    Label("session.offline.title", systemImage: "wifi.slash")
                } description: {
                    Text("session.offline.message")
                } actions: {
                    Button("session.offline.retry") { Task { await session.start() } }
                }
            case .needsOrganization:
                OrganizationSetupView()
            case .ready(let orgId, _):
                HomeView(orgId: orgId)
            }
        }
        .task { await session.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { session.sync?.syncSoon(after: 0.5) }
        }
    }
}

/// Placeholder home until step 7 adds Clients / Jobs / Settings.
struct HomeView: View {
    @Environment(SessionStore.self) private var session
    @Query private var orgs: [Organization]

    init(orgId: UUID) {
        _orgs = Query(filter: #Predicate<Organization> { $0.id == orgId })
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "hammer.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.tint)
                Text("home.welcome")
                    .font(.title2.bold())
                if let org = orgs.first {
                    Text(org.name).font(.headline)
                }
                if let sync = session.sync {
                    SyncStatusView(sync: sync)
                }
            }
            .padding()
            .navigationTitle(Text("app.name"))
        }
    }
}

struct SyncStatusView: View {
    let sync: SyncEngine

    var body: some View {
        VStack(spacing: 4) {
            switch sync.status {
            case .syncing:
                Label("sync.status.syncing", systemImage: "arrow.triangle.2.circlepath")
            case .offline:
                Label("sync.status.offline", systemImage: "wifi.slash")
            case .failed:
                Label("sync.status.failed", systemImage: "exclamationmark.triangle")
            case .idle:
                if let last = sync.lastSyncedAt {
                    Label { Text("sync.status.synced \(last, style: .relative)") } icon: {
                        Image(systemName: "checkmark.icloud")
                    }
                } else {
                    Label("sync.status.never", systemImage: "icloud")
                }
            }
            if sync.pendingCount > 0 {
                Text("sync.pending \(sync.pendingCount)")
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
}
