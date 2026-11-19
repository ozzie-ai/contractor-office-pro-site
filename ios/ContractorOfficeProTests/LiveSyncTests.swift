import Foundation
import os
import Supabase
import SwiftData
import Testing
@testable import ContractorOfficePro

/// Against the dev Supabase project. Run with:
/// TEST_RUNNER_LIVE_SUPABASE=1 xcodebuild ... test
/// Uses its own anonymous account (in-memory session) so it never touches the app's account.
@Suite("Live Supabase", .serialized,
       .enabled(if: ProcessInfo.processInfo.environment["LIVE_SUPABASE"] == "1" && AppConfig.isBackendConfigured))
struct LiveSyncTests {
    @Test(.timeLimit(.minutes(1)))
    func twoPhonesSyncThroughTheRealServer() async throws {
        let client = SupabaseClient(
            supabaseURL: try #require(AppConfig.supabaseURL), supabaseKey: try #require(AppConfig.supabaseAnonKey),
            options: .init(auth: .init(storage: MemoryAuthStorage(), emitLocalSessionAsInitialSession: true)))
        let account = SupabaseAccountClient(client: client)
        let transport = SupabaseSyncTransport(client: client)

        let phone1 = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let session = SessionStore(account: account, transport: transport, context: phone1,
                                   defaults: PreviewData.ephemeralDefaults())
        await session.start()
        try await session.createOrganization(name: "LIVE TEST Flores", ownerName: "Test Owner", language: .es)
        guard case .ready(let orgID, let memberID) = session.state else { Issue.record("not ready"); return }

        let customer = Client(orgId: orgID, name: "Ana")
        let job = Job(orgId: orgID, clientId: customer.id, title: "Panel 100A → 200A", assignedTo: memberID)
        let line = LineItem(orgId: orgID, estimateId: UUID(), descriptionEn: "Panel upgrade",
                            unitPrice: try #require(Decimal(string: "2100.00")))
        phone1.insert(customer); phone1.insert(job)
        let estimate = Estimate(orgId: orgID, jobId: job.id)
        line.estimateId = estimate.id
        phone1.insert(estimate); phone1.insert(line)
        let sync1 = SyncEngine(transport: transport, context: phone1, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        await sync1.syncNow()
        #expect(sync1.status == .idle)
        #expect(sync1.pendingCount == 0)

        let phone2 = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let sync2 = SyncEngine(transport: transport, context: phone2, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        await sync2.syncNow()
        let copy = try #require(try phone2.fetch(FetchDescriptor<Client>()).first { $0.id == customer.id })
        #expect(try phone2.fetch(FetchDescriptor<LineItem>()).first?.unitPrice == Decimal(string: "2100.00"))
        #expect(try phone2.fetch(FetchDescriptor<Organization>()).first?.name == "LIVE TEST Flores")

        customer.phone = "111"; customer.touch(now: .now.addingTimeInterval(-30))
        copy.phone = "222"; copy.touch()
        await sync2.syncNow()
        await sync1.syncNow()
        #expect(customer.phone == "222", "the real server's LWW trigger keeps the newer edit")
    }
}

/// In-memory auth session storage for tests. Lock-protected state, no @unchecked Sendable.
nonisolated final class MemoryAuthStorage: AuthLocalStorage, Sendable {
    private let items = OSAllocatedUnfairLock(initialState: [String: Data]())
    func store(key: String, value: Data) throws { items.withLock { $0[key] = value } }
    func retrieve(key: String) throws -> Data? { items.withLock { $0[key] } }
    func remove(key: String) throws { _ = items.withLock { $0.removeValue(forKey: key) } }
}
