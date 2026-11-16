import Foundation
import SwiftData
import Testing
@testable import ContractorOfficePro

/// Two "phones" sharing one FakeBackend that enforces the same LWW rule as the real server.
@Suite("Sync engine")
struct SyncEngineTests {
    let backend = FakeBackend()
    let orgID = UUID()
    let phone1: ModelContext
    let phone2: ModelContext
    let sync1: SyncEngine
    let sync2: SyncEngine

    init() throws {
        phone1 = ModelContext(try AppSchema.makeContainer(inMemory: true))
        phone2 = ModelContext(try AppSchema.makeContainer(inMemory: true))
        sync1 = SyncEngine(transport: backend, context: phone1, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        sync2 = SyncEngine(transport: backend, context: phone2, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
    }

    @Test func uploadsDirtyRowsAndMarksThemClean() async throws {
        let client = Client(orgId: orgID, name: "Ana")
        let job = Job(orgId: orgID, clientId: client.id, title: "Panel 100A → 200A", assignedTo: nil)
        phone1.insert(client)
        phone1.insert(job)
        try phone1.save()

        await sync1.syncNow()

        #expect(sync1.status == .idle)
        #expect(!client.needsSync && !job.needsSync)
        #expect(sync1.pendingCount == 0)
        #expect(await backend.row(in: "jobs", id: job.id)?.string("title") == "Panel 100A → 200A")
    }

    @Test func secondPhoneDownloadsEverythingWithExactMoney() async throws {
        let estimate = Estimate(orgId: orgID, jobId: UUID())
        let line = LineItem(orgId: orgID, estimateId: estimate.id, descriptionEn: "Panel upgrade",
                            unitPrice: try #require(Decimal(string: "2100.00")))
        phone1.insert(estimate)
        phone1.insert(line)
        try phone1.save()
        await sync1.syncNow()

        await sync2.syncNow()

        let copy = try #require(try phone2.fetch(FetchDescriptor<LineItem>()).first)
        #expect(copy.id == line.id)
        #expect(copy.unitPrice == Decimal(string: "2100.00"))
        #expect(!copy.needsSync)
    }

    @Test func newerEditWinsOnBothPhones() async throws {
        let client = Client(orgId: orgID, name: "Ana")
        phone1.insert(client)
        try phone1.save()
        await sync1.syncNow()
        await sync2.syncNow()
        let copy = try #require(try phone2.fetch(FetchDescriptor<Client>()).first)

        client.phone = "111"; client.touch(now: .now.addingTimeInterval(-30))   // older edit
        copy.phone = "222"; copy.touch()                                         // newer edit
        await sync2.syncNow()
        await sync1.syncNow()
        await sync2.syncNow()

        #expect(client.phone == "222", "older local edit loses on phone 1")
        #expect(copy.phone == "222")
        #expect(await backend.row(in: "clients", id: client.id)?.string("phone") == "222")
    }

    @Test func softDeleteTravels() async throws {
        let client = Client(orgId: orgID, name: "Ana")
        phone1.insert(client)
        await sync1.syncNow()
        await sync2.syncNow()

        client.softDelete()
        await sync1.syncNow()
        await sync2.syncNow()

        #expect(try phone2.fetch(FetchDescriptor<Client>()).first?.deletedAt != nil)
    }

    @Test func offlineKeepsChangesQueuedAndRetriesLater() async throws {
        await backend.setOffline(true)
        let client = Client(orgId: orgID, name: "Ana")
        phone1.insert(client)
        await sync1.syncNow()
        #expect(sync1.status == .offline)
        #expect(client.needsSync)
        #expect(sync1.pendingCount == 1)

        await backend.setOffline(false)
        await sync1.syncNow()
        #expect(sync1.status == .idle)
        #expect(!client.needsSync)
    }

    @Test func pullPagesThroughLargeChangeSets() async throws {
        for i in 0..<1_234 { phone1.insert(Client(orgId: orgID, name: "Client \(i)")) }
        try phone1.save()
        await sync1.syncNow()

        await sync2.syncNow()

        #expect(try phone2.fetchCount(FetchDescriptor<Client>()) == 1_234)
    }

    @Test func otherBusinessesDataNeverArrives() async throws {
        let stranger = Client(orgId: UUID(), name: "Not yours")
        try await backend.upsert([stranger.row()], into: "clients")

        await sync2.syncNow()

        #expect(try phone2.fetch(FetchDescriptor<Client>()).isEmpty)
    }
}
