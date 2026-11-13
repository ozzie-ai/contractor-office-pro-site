#if DEBUG
import Foundation
import SwiftData

/// Deterministic fixtures for SwiftUI previews (swiftui-patterns: isolated previews).
enum PreviewData {
    static let userID = UUID(uuidString: "00000000-0000-0000-0000-0000000000AA")!

    /// Empty store + fake backend with no account yet: the app shows business setup.
    static func firstLaunch() -> (ModelContainer, SessionStore) {
        let container = try! AppSchema.makeContainer(inMemory: true)
        let session = SessionStore(account: FakeBackend(), transport: FakeBackend(),
                                   context: container.mainContext, defaults: ephemeralDefaults())
        return (container, session)
    }

    /// A signed-in owner with a business already on the device.
    static func ready() -> (ModelContainer, SessionStore) {
        let container = try! AppSchema.makeContainer(inMemory: true)
        let org = Organization(name: "Flores Construction", defaultLanguage: .en)
        let owner = Member(orgId: org.id, userId: userID, displayName: "Derek", role: .owner)
        org.needsSync = false
        owner.needsSync = false
        container.mainContext.insert(org)
        container.mainContext.insert(owner)
        let backend = FakeBackend(signedInUser: userID)
        let session = SessionStore(account: backend, transport: backend,
                                   context: container.mainContext, defaults: ephemeralDefaults())
        return (container, session)
    }

    /// No account and no connection.
    static func offline() -> (ModelContainer, SessionStore) {
        let container = try! AppSchema.makeContainer(inMemory: true)
        let backend = FakeBackend(offline: true)
        let session = SessionStore(account: backend, transport: backend,
                                   context: container.mainContext, defaults: ephemeralDefaults())
        return (container, session)
    }

    static func ephemeralDefaults() -> UserDefaults {
        UserDefaults(suiteName: "preview-\(UUID().uuidString)")!
    }
}
#endif
