import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

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
                Text("home.backend.configured")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle(Text("app.name"))
        }
    }
}
