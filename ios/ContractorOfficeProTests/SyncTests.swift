import Supabase
import SwiftData
import XCTest
@testable import ContractorOfficePro

final class SyncDateTests: XCTestCase {
    func testParsesPostgresMicroseconds() throws {
        let d = try XCTUnwrap(SyncDate.parse("2026-11-12T20:15:30.123456+00:00"))
        XCTAssertEqual(d.timeIntervalSince1970, 1_794_514_530.123, accuracy: 0.0005)
    }

    func testParsesWholeSecondsAndRoundTrips() throws {
        let d = try XCTUnwrap(SyncDate.parse("2026-11-12T20:15:30Z"))
        XCTAssertEqual(SyncDate.parse(SyncDate.format(d)), d)
    }

    func testDayColumns() throws {
        let d = try XCTUnwrap(SyncDate.parseDay("2026-03-09"))
        XCTAssertEqual(SyncDate.formatDay(d), "2026-03-09")
    }
}

final class SyncRulesTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 1000)

    func testCleanLocalAlwaysTakesServer() {
        XCTAssertTrue(SyncRules.shouldApplyRemote(localDirty: false, localUpdatedAt: t0, remoteUpdatedAt: t0 - 60))
    }
    func testNewerLocalEditIsKept() {
        XCTAssertFalse(SyncRules.shouldApplyRemote(localDirty: true, localUpdatedAt: t0, remoteUpdatedAt: t0 - 60))
    }
    func testNewerServerEditWins() {
        XCTAssertTrue(SyncRules.shouldApplyRemote(localDirty: true, localUpdatedAt: t0, remoteUpdatedAt: t0 + 60))
    }
}

@MainActor
final class SyncMappingTests: XCTestCase {
    /// Row -> JSON -> Row survives the trip like a real server response (decimals as numbers).
    private func throughJSON(_ row: Row) throws -> Row {
        try JSONDecoder().decode(Row.self, from: JSONEncoder().encode(row))
    }

    func testClientRoundTrip() throws {
        let c = Client(orgId: UUID(), name: "Ana López", preferredLanguage: .es)
        c.phone = "555-0100"; c.isSenior65Plus = true; c.smsConsent = .granted; c.notes = "Gate code 1234"
        c.touch()
        let copy = try XCTUnwrap(Client.make(try throughJSON(c.row())))
        XCTAssertEqual(copy.id, c.id); XCTAssertEqual(copy.orgId, c.orgId); XCTAssertEqual(copy.name, "Ana López")
        XCTAssertEqual(copy.preferredLanguage, .es); XCTAssertTrue(copy.isSenior65Plus)
        XCTAssertEqual(copy.smsConsent, .granted); XCTAssertEqual(copy.updatedAt, c.updatedAt)
        XCTAssertFalse(copy.needsSync)
    }

    func testMoneyStaysExact() throws {
        let l = LineItem(orgId: UUID(), estimateId: UUID(), descriptionEn: "Breaker", qty: Decimal(string: "2.5")!,
                         unitPrice: Decimal(string: "19.99")!, source: .priceBook)
        let row = l.row()
        XCTAssertEqual(row["unit_price"], .string("19.99"), "money is sent as an exact string")
        // Server returns numerics as JSON numbers:
        var serverRow = row
        serverRow["unit_price"] = .double(19.99); serverRow["qty"] = .double(2.5)
        let copy = try XCTUnwrap(LineItem.make(serverRow))
        XCTAssertEqual(copy.unitPrice, Decimal(string: "19.99")); XCTAssertEqual(copy.qty, Decimal(string: "2.5"))
        XCTAssertEqual(copy.source, .priceBook)
    }

    func testMediaKeepsDeviceOnlyFileName() throws {
        let m = Media(orgId: UUID(), jobId: UUID(), kind: .voice, localFileName: "abc.m4a")
        XCTAssertNil(m.row()["local_file_name"], "device-only fields never go to the server")
        var r = m.row(); r["transcript"] = .string("Cambiar panel de 100 a 200 amperios")
        m.apply(r)
        XCTAssertEqual(m.localFileName, "abc.m4a"); XCTAssertEqual(m.transcript, "Cambiar panel de 100 a 200 amperios")
    }

    func testEveryTableMakesFromItsOwnRow() throws {
        let org = UUID(), job = UUID()
        let records: [any SyncRecord] = [
            Organization(name: "O"), Member(orgId: org, displayName: "M"), Client(orgId: org, name: "C"),
            Job(orgId: org, title: "J", assignedTo: nil), TimeEntry(orgId: org, jobId: job, memberId: nil),
            PriceBookItem(orgId: org, kind: .labor, nameEn: "P"), Estimate(orgId: org, jobId: job),
            LineItem(orgId: org, estimateId: UUID()), Receipt(orgId: org), Expense(orgId: org, amount: 12),
            ReceiptLineItem(orgId: org, receiptId: UUID(), description: "2x4"),
            Media(orgId: org, jobId: job, kind: .photo, localFileName: nil),
        ]
        for r in records {
            XCTAssertNotNil(remake(r), "\(type(of: r)) can't be rebuilt from its row")
        }
    }

    private func remake<T: SyncRecord>(_ r: T) -> T? { T.make(r.row()) }
}

// MARK: - Live test against the dev Supabase project

/// Runs only when LIVE_SUPABASE=1 (xcodebuild ... test TEST_RUNNER_LIVE_SUPABASE=1).
/// Uses its own anonymous account with in-memory session storage, so it never touches the app's account.
@MainActor
final class LiveSyncTests: XCTestCase {
    override func setUp() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["LIVE_SUPABASE"] == "1", "set LIVE_SUPABASE=1")
        try XCTSkipUnless(AppConfig.isBackendConfigured, "no Supabase config")
    }

    func testTwoDevicesSyncAndLastWriteWins() async throws {
        let client = SupabaseClient(
            supabaseURL: AppConfig.supabaseURL!, supabaseKey: AppConfig.supabaseAnonKey!,
            options: .init(auth: .init(storage: MemoryAuthStorage(), emitLocalSessionAsInitialSession: true)))
        let suite = "live-sync-\(UUID().uuidString)"
        let defaults1 = UserDefaults(suiteName: suite + "-1")!, defaults2 = UserDefaults(suiteName: suite + "-2")!

        // Device 1: sign in, set up the business.
        let phone1 = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let session = SessionStore(client: client, context: phone1)
        await session.start()
        guard case .needsOrganization = session.state else { return XCTFail("expected org setup, got \(session.state)") }
        try await session.createOrganization(name: "LIVE TEST Flores", ownerName: "Test Owner", language: .es)
        guard case .ready(let orgId, let memberId) = session.state else { return XCTFail("not ready") }

        // Device 1 creates data offline, then syncs.
        let c = Client(orgId: orgId, name: "Ana"); phone1.insert(c)
        let j = Job(orgId: orgId, clientId: c.id, title: "Panel 100A → 200A", assignedTo: memberId); phone1.insert(j)
        let e = Estimate(orgId: orgId, jobId: j.id); phone1.insert(e)
        let line = LineItem(orgId: orgId, estimateId: e.id, descriptionEn: "Panel upgrade", qty: 1,
                            unitPrice: Decimal(string: "2100.00")!, source: .manual); phone1.insert(line)
        try phone1.save()
        let sync1 = SyncEngine(client: client, context: phone1, orgId: orgId, defaults: defaults1)
        await sync1.syncNow()
        XCTAssertEqual(sync1.status, .idle)
        XCTAssertFalse(c.needsSync || j.needsSync || e.needsSync || line.needsSync, "everything uploaded")

        // Device 2 (same account, empty phone) pulls everything.
        let phone2 = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let sync2 = SyncEngine(client: client, context: phone2, orgId: orgId, defaults: defaults2)
        await sync2.syncNow()
        let c2 = try XCTUnwrap(try phone2.fetch(FetchDescriptor<Client>()).first { $0.id == c.id })
        let line2 = try XCTUnwrap(try phone2.fetch(FetchDescriptor<LineItem>()).first { $0.id == line.id })
        XCTAssertEqual(c2.name, "Ana")
        XCTAssertEqual(line2.unitPrice, Decimal(string: "2100.00"))
        XCTAssertEqual(try phone2.fetch(FetchDescriptor<Organization>()).first?.name, "LIVE TEST Flores")

        // Conflict: device 1 edits first (older), device 2 edits later (newer). Newer must win on both.
        c.phone = "111"; c.touch(now: .now.addingTimeInterval(-30))
        c2.phone = "222"; c2.touch()
        try phone1.save(); try phone2.save()
        await sync2.syncNow()
        await sync1.syncNow()
        XCTAssertEqual(c.phone, "222", "older local edit loses to newer server edit")
        await sync2.syncNow()
        XCTAssertEqual(c2.phone, "222")

        // Soft delete travels too.
        line.softDelete(); try phone1.save()
        await sync1.syncNow(); await sync2.syncNow()
        XCTAssertNotNil(line2.deletedAt, "deletion synced to device 2")

        // Tidy: soft-delete the test business's client so it's easy to spot. Hard cleanup runs server-side.
        defaults1.removePersistentDomain(forName: suite + "-1"); defaults2.removePersistentDomain(forName: suite + "-2")
    }
}

final class MemoryAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private var items: [String: Data] = [:]
    private let lock = NSLock()
    func store(key: String, value: Data) throws { lock.withLock { items[key] = value } }
    func retrieve(key: String) throws -> Data? { lock.withLock { items[key] } }
    func remove(key: String) throws { _ = lock.withLock { items.removeValue(forKey: key) } }
}
