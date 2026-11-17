import SwiftUI

enum AppTab: Hashable { case jobs, clients, settings }

/// Pushed destinations, shared by every tab's NavigationStack.
enum AppRoute: Hashable {
    case job(UUID)
    case client(UUID)
}

extension View {
    func appDestinations() -> some View {
        navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .job(let id): JobDetailView(jobID: id)
            case .client(let id): ClientDetailView(clientID: id)
            }
        }
    }
}

struct MainTabView: View {
    @Environment(\.scenePhase) private var scenePhase
    let workspace: Workspace
    @State private var selectedTab: AppTab = .jobs
    @State private var jobsPath: [AppRoute] = []
    @State private var clientsPath: [AppRoute] = []

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab(value: AppTab.jobs) {
                NavigationStack(path: $jobsPath) {
                    JobListView().appDestinations()
                }
            } label: {
                Label { Text(.tabJobs) } icon: { Image(systemName: "hammer") }
            }
            Tab(value: AppTab.clients) {
                NavigationStack(path: $clientsPath) {
                    ClientListView().appDestinations()
                }
            } label: {
                Label { Text(.tabClients) } icon: { Image(systemName: "person.2") }
            }
            Tab(value: AppTab.settings) {
                NavigationStack {
                    SettingsView()
                }
            } label: {
                Label { Text(.tabSettings) } icon: { Image(systemName: "gearshape") }
            }
        }
        .environment(workspace)
        .task { await workspace.sync.run() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { workspace.sync.syncSoon(after: 0.5) }
        }
    }
}

#Preview("Ready, with sample data") {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
}

#Preview("Spanish") {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
        .environment(\.locale, Locale(identifier: "es"))
}
