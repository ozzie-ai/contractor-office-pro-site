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
    static func ready(withSamples: Bool = false) -> (ModelContainer, SessionStore) {
        let container = try! AppSchema.makeContainer(inMemory: true)
        let org = Organization(name: "Flores Construction", defaultLanguage: .en)
        let owner = Member(orgId: org.id, userId: userID, displayName: "Derek", role: .owner)
        org.needsSync = false
        owner.needsSync = false
        container.mainContext.insert(org)
        container.mainContext.insert(owner)
        if withSamples { insertSamples(into: container.mainContext, orgID: org.id, ownerID: owner.id) }
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

    static func insertSamples(into context: ModelContext, orgID: UUID, ownerID: UUID) {
        let ana = Client(orgId: orgID, name: "Ana López", preferredLanguage: .es)
        ana.phone = "(323) 555-0142"; ana.address = "1420 Echo Park Ave, Los Angeles, CA"; ana.smsConsent = .granted
        let bob = Client(orgId: orgID, name: "Bob Chen")
        bob.phone = "(626) 555-0188"; bob.email = "bob@example.com"; bob.isSenior65Plus = true
        let maria = Client(orgId: orgID, name: "María Hernández", preferredLanguage: .es)
        for client in [ana, bob, maria] { context.insert(client) }

        let panel = Job(orgId: orgID, clientId: ana.id, title: "Panel upgrade 100A → 200A", assignedTo: ownerID)
        panel.address = ana.address; panel.status = .scheduled
        panel.scheduledStart = Calendar.current.date(byAdding: .day, value: 2, to: .now)
        let bath = Job(orgId: orgID, clientId: bob.id, title: "Bathroom remodel", assignedTo: ownerID)
        bath.status = .estimating
        let fence = Job(orgId: orgID, clientId: maria.id, title: "Fence repair", assignedTo: ownerID)
        fence.status = .inProgress
        let gfci = Job(orgId: orgID, clientId: ana.id, title: "GFCI outlets", assignedTo: ownerID)
        gfci.status = .completed
        for job in [panel, bath, fence, gfci] { context.insert(job) }
    }

    static func ephemeralDefaults() -> UserDefaults {
        UserDefaults(suiteName: "preview-\(UUID().uuidString)")!
    }
}
#endif
