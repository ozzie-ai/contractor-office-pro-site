import SwiftData
import SwiftUI

/// Routes on session state. The account flow is the one place a top-level switch is the right tool.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var splashFinished = ProcessInfo.processInfo.arguments.contains("-noSplash")
    @AppStorage("biggerText") private var biggerText = false

    private var showSplash: Bool { !splashFinished || session.state == .loading }

    var body: some View {
        ZStack {
            content
                .scaleEffect(showSplash && !reduceMotion ? 0.96 : 1)
                .opacity(showSplash ? 0 : 1)
            if showSplash {
                SplashView()
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 1.04)))
                    .zIndex(1)
            }
        }
        .animation(.smooth(duration: 0.5), value: showSplash)
        .dynamicTypeSize(biggerText ? .xLarge ... .accessibility3 : .xSmall ... .accessibility5)
        .task { await session.start() }
        .task {
            guard !splashFinished else { return }
            try? await Task.sleep(for: .seconds(reduceMotion ? 0.6 : 1.6))
            splashFinished = true
        }
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
                .primaryActionStyle()
        }
    }
}

#if DEBUG
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
#endif
