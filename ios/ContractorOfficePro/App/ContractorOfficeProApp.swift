import SwiftData
import SwiftUI

@main
struct ContractorOfficeProApp: App {
    private let container: ModelContainer
    @State private var session: SessionStore

    init() {
        #if DEBUG
        // Demo mode: sample data in memory + fake server. Never touches the real account.
        if ProcessInfo.processInfo.arguments.contains("-demo") {
            let (container, session) = PreviewData.ready(withSamples: true)
            self.container = container
            _session = State(initialValue: session)
            return
        }
        #endif
        do {
            let container = try AppSchema.makeContainer()
            self.container = container
            _session = State(initialValue: .live(context: container.mainContext))
        } catch {
            fatalError("Could not open local store: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
        .modelContainer(container)
    }
}
