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
        let leftover = StockItem(orgId: orgID, nameEn: "8 AWG THHN wire", qty: 85, unit: "ft")
        leftover.sourceEstimateId = estimate.id
        let tool = Tool(orgId: orgID, nameEn: "Cordless drill", category: "power_tool")
        tool.holder = "Carlos"; tool.photoFileName = "local-only.jpg"
        phone1.insert(leftover); phone1.insert(tool)
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
        #expect(try phone2.fetch(FetchDescriptor<StockItem>()).first?.qty == 85)
        let toolCopy = try #require(try phone2.fetch(FetchDescriptor<Tool>()).first)
        #expect(toolCopy.holder == "Carlos" && toolCopy.photoFileName == nil, "tool syncs; its photo stays on phone 1")

        customer.phone = "111"; customer.touch(now: .now.addingTimeInterval(-30))
        copy.phone = "222"; copy.touch()
        await sync2.syncNow()
        await sync1.syncNow()
        #expect(customer.phone == "222", "the real server's LWW trigger keeps the newer edit")
    }
}

/// App ↔ real backend ↔ real Supabase. Start the backend first, then:
/// TEST_RUNNER_LIVE_BACKEND=1 xcodebuild ... test   (uses BACKEND_URL from Config.xcconfig; a few OpenAI calls)
@Suite("Live backend", .serialized,
       .enabled(if: ProcessInfo.processInfo.environment["LIVE_BACKEND"] == "1" && AppConfig.backendURL != nil))
struct LiveBackendTests {
    @Test(.timeLimit(.minutes(2)))
    func draftsAndPricesAnEstimateThroughTheRealBackend() async throws {
        let client = SupabaseClient(
            supabaseURL: try #require(AppConfig.supabaseURL), supabaseKey: try #require(AppConfig.supabaseAnonKey),
            options: .init(auth: .init(storage: MemoryAuthStorage(), emitLocalSessionAsInitialSession: true)))
        let context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let service = BackendClient(baseURL: try #require(AppConfig.backendURL),
                                    accessToken: { try await client.auth.session.accessToken })
        let session = SessionStore(account: SupabaseAccountClient(client: client), transport: SupabaseSyncTransport(client: client),
                                   estimateService: service, context: context, defaults: PreviewData.ephemeralDefaults())
        await session.start()
        try await session.createOrganization(name: "LIVE TEST Backend", ownerName: "Test", language: .es)
        let workspace = try #require(session.workspace)
        let job = try workspace.save({ var d = JobDraft(); d.title = "Panel"; return d }())

        let notes = "Cambiar el panel de 100 a 200 amperios, transferir 20 circuitos existentes y dejar un breaker de 100 amperios para un subpanel futuro."
        let draft = try await EstimateDrafting.draft(notes: notes, language: .es, service: service)
        let estimate = try workspace.createEstimate(for: job, notes: notes, language: .es, draft: draft)
        let lines = workspace.lines(for: estimate)

        #expect(lines.contains { $0.taskCode == "ELEC.PANEL.UPGRADE" && $0.priceSource == .reference && $0.unitPrice == 2100 })
        #expect(lines.contains { $0.taskCode == "ELEC.CIRCUIT.TRANSFER" && $0.qty == 20 })
        #expect(estimate.subtotal >= 2100)
        #expect(estimate.exclusions?.isEmpty == false, "future subpanel is excluded")
    }
}

/// In-memory auth session storage for tests. Lock-protected state, no @unchecked Sendable.
nonisolated final class MemoryAuthStorage: AuthLocalStorage, Sendable {
    private let items = OSAllocatedUnfairLock(initialState: [String: Data]())
    func store(key: String, value: Data) throws { items.withLock { $0[key] = value } }
    func retrieve(key: String) throws -> Data? { items.withLock { $0[key] } }
    func remove(key: String) throws { _ = items.withLock { $0.removeValue(forKey: key) } }
}
