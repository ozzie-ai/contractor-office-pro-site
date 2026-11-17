import SwiftData
import SwiftUI

/// Routes on session state. The account flow is the one place a top-level switch is the right tool.
struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        content
            .task { await session.start() }
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .loading:
            ProgressView()
        case .backendMissing:
            ContentUnavailableView {
                Label { Text(.homeBackendMissing) } icon: { Image(systemName: "exclamationmark.icloud") }
            }
        case .signedOut:
            SignInView()
        case .offline:
            OfflineView { Task { await session.start() } }
        case .needsOrganization:
            OrganizationSetupView()
        case .ready:
            if let workspace = session.workspace {
                MainTabView(workspace: workspace)
            }
        }
    }
}

private struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label { Text(.sessionOfflineTitle) } icon: { Image(systemName: "wifi.slash") }
        } description: {
            Text(.sessionOfflineMessage)
        } actions: {
            Button(action: retry) { Text(.sessionOfflineRetry) }
                .buttonStyle(.borderedProminent)
        }
    }
}

#Preview("First launch") {
    let (container, session) = PreviewData.firstLaunch()
    return RootView().environment(session).modelContainer(container)
}

#Preview("Ready") {
    let (container, session) = PreviewData.ready()
    return RootView().environment(session).modelContainer(container)
}

#Preview("Offline, Spanish") {
    let (container, session) = PreviewData.offline()
    return RootView().environment(session).modelContainer(container)
        .environment(\.locale, Locale(identifier: "es"))
}
