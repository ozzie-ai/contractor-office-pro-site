import SwiftData
import SwiftUI

@main
struct ContractorOfficeProApp: App {
    let container: ModelContainer
    @State private var session: SessionStore

    init() {
        do {
            let container = try AppSchema.makeContainer()
            self.container = container
            _session = State(initialValue: SessionStore(context: container.mainContext))
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
