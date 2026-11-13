import Foundation
import SwiftData
import Testing
@testable import ContractorOfficePro

@Suite("Session and business setup")
struct SessionStoreTests {
    private func makeSession(_ backend: FakeBackend) throws -> (SessionStore, ModelContext) {
        let context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let session = SessionStore(account: backend, transport: backend, context: context,
                                   defaults: PreviewData.ephemeralDefaults())
        return (session, context)
    }

    @Test func firstLaunchSignsInAnonymouslyThenAsksForBusiness() async throws {
        let (session, _) = try makeSession(FakeBackend())
        await session.start()
        guard case .needsOrganization = session.state else {
            Issue.record("expected business setup, got \(session.state)"); return
        }
        #expect(session.sync == nil)
    }

    @Test func creatingBusinessRegistersItAndBecomesReady() async throws {
        let backend = FakeBackend()
        let (session, context) = try makeSession(backend)
        await session.start()

        try await session.createOrganization(name: "  Flores Construction ", ownerName: "Derek", language: .es)

        guard case .ready(let orgID, let memberID) = session.state else {
            Issue.record("not ready: \(session.state)"); return
        }
        #expect(session.sync != nil)
        let org = try #require(try context.fetch(FetchDescriptor<Organization>()).first)
        #expect(org.id == orgID)
        #expect(org.name == "Flores Construction")
        #expect(org.defaultLanguage == .es)
        #expect(!org.needsSync)
        #expect(await backend.row(in: "members", id: memberID)?.string("role") == "owner")
    }

    @Test func sameAccountOnANewPhoneDownloadsItsBusiness() async throws {
        let backend = FakeBackend()
        let (first, _) = try makeSession(backend)
        await first.start()
        try await first.createOrganization(name: "Flores Construction", ownerName: "Derek", language: .en)
        guard case .ready(let orgID, _) = first.state else { Issue.record("not ready"); return }

        let (second, context2) = try makeSession(backend)   // same signed-in user, empty phone
        await second.start()

        #expect(second.state == first.state)
        #expect(try context2.fetch(FetchDescriptor<Organization>()).first?.id == orgID)
    }

    @Test func firstLaunchWithoutInternetShowsOffline() async throws {
        let (session, _) = try makeSession(FakeBackend(offline: true))
        await session.start()
        #expect(session.state == .offline)
    }

    @Test func businessSetupFailsCleanlyOffline() async throws {
        let backend = FakeBackend()
        let (session, context) = try makeSession(backend)
        await session.start()
        await backend.setOffline(true)

        await #expect(throws: SessionStore.Failure.organizationSetup) {
            try await session.createOrganization(name: "X", ownerName: "Y", language: .en)
        }
        #expect(try context.fetch(FetchDescriptor<Organization>()).isEmpty, "nothing half-created locally")
    }
}
