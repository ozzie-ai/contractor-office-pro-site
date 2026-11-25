import SwiftUI

enum AppTab: Hashable { case jobs, clients, truck, settings }

/// Pushed destinations, shared by every tab's NavigationStack.
enum AppRoute: Hashable {
    case job(UUID)
    case client(UUID)
    case estimate(UUID)
    case materials(UUID)
}

extension EnvironmentValues {
    /// Namespace for navigation zoom transitions within the current tab.
    @Entry var zoomNamespace: Namespace.ID?
}

extension View {
    func appDestinations(zoom namespace: Namespace.ID? = nil) -> some View {
        navigationDestination(for: AppRoute.self) { route in
            Group {
                switch route {
                case .job(let id): JobDetailView(jobID: id)
                case .client(let id): ClientDetailView(clientID: id)
                case .estimate(let id): EstimateView(estimateID: id)
                case .materials(let id): MaterialsView(estimateID: id)
                }
            }
            .modifier(ZoomDestination(route: route, namespace: namespace))
        }
        .environment(\.zoomNamespace, namespace)
    }

    /// Marks a row as the zoom source for its route.
    func zoomSource(_ route: AppRoute) -> some View {
        modifier(ZoomSource(route: route))
    }
}

private struct ZoomDestination: ViewModifier {
    let route: AppRoute
    let namespace: Namespace.ID?

    func body(content: Content) -> some View {
        if let namespace {
            content.navigationTransition(.zoom(sourceID: route, in: namespace))
        } else {
            content
        }
    }
}

private struct ZoomSource: ViewModifier {
    @Environment(\.zoomNamespace) private var namespace
    let route: AppRoute

    func body(content: Content) -> some View {
        if let namespace {
            content.matchedTransitionSource(id: route, in: namespace)
        } else {
            content
        }
    }
}

struct MainTabView: View {
    @Environment(\.scenePhase) private var scenePhase
    let workspace: Workspace
    @State private var selectedTab: AppTab = .jobs
    @State private var jobsPath: [AppRoute] = []
    @State private var clientsPath: [AppRoute] = []
    @Namespace private var jobsZoom
    @Namespace private var clientsZoom

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab(value: AppTab.jobs) {
                NavigationStack(path: $jobsPath) {
                    JobListView().appDestinations(zoom: jobsZoom)
                }
            } label: {
                Label { Text(.tabJobs) } icon: { Image(systemName: "hammer") }
            }
            Tab(value: AppTab.clients) {
                NavigationStack(path: $clientsPath) {
                    ClientListView().appDestinations(zoom: clientsZoom)
                }
            } label: {
                Label { Text(.tabClients) } icon: { Image(systemName: "person.2") }
            }
            Tab(value: AppTab.truck) {
                NavigationStack {
                    TruckView()
                }
            } label: {
                Label { Text(.tabTruck) } icon: { Image(systemName: "truck.box") }
            }
            Tab(value: AppTab.settings) {
                NavigationStack {
                    SettingsView()
                }
            } label: {
                Label { Text(.tabSettings) } icon: { Image(systemName: "gearshape") }
            }
        }
        .modifier(MinimizingTabBar())
        .environment(workspace)
        .task { await workspace.sync.run() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { workspace.sync.syncSoon(after: 0.5) }
        }
    }
}

/// iOS 26: the glass tab bar shrinks as you scroll down and returns when you scroll back.
private struct MinimizingTabBar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content
        }
    }
}

#if DEBUG
#Preview("Ready, with sample data") {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
}

#Preview("Spanish") {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
        .environment(\.locale, Locale(identifier: "es"))
}
#endif
