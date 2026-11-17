import Foundation
import Supabase
import Testing
@testable import ContractorOfficePro

@Suite("Wire dates")
struct SyncDateTests {
    @Test func parsesPostgresMicrosecondsAndOffset() throws {
        let date = try #require(SyncDate.parse("2026-11-12T20:15:30.123456+00:00"))
        #expect(abs(date.timeIntervalSince1970 - 1_794_514_530.123) < 0.0005)
    }

    @Test func parsesWholeSecondsAndRoundTrips() throws {
        let date = try #require(SyncDate.parse("2026-11-12T20:15:30Z"))
        #expect(SyncDate.parse(SyncDate.format(date)) == date)
    }

    @Test func dayColumnsRoundTrip() throws {
        let day = try #require(SyncDate.parseDay("2026-03-09"))
        #expect(SyncDate.formatDay(day) == "2026-03-09")
    }
}

@Suite("Last-write-wins rule")
struct SyncRulesTests {
    let t0 = Date(timeIntervalSince1970: 1000)

    @Test func cleanLocalAlwaysTakesServer() {
        #expect(SyncRules.shouldApplyRemote(localDirty: false, localUpdatedAt: t0, remoteUpdatedAt: t0 - 60))
    }

    @Test func newerLocalEditIsKept() {
        #expect(!SyncRules.shouldApplyRemote(localDirty: true, localUpdatedAt: t0, remoteUpdatedAt: t0 - 60))
    }

    @Test func newerServerEditWins() {
        #expect(SyncRules.shouldApplyRemote(localDirty: true, localUpdatedAt: t0, remoteUpdatedAt: t0 + 60))
    }
}

@Suite("Row mappings")
struct SyncMappingTests {
    /// Row -> JSON -> Row, the way a real server response arrives.
    private func throughJSON(_ row: Row) throws -> Row {
        try JSONDecoder().decode(Row.self, from: JSONEncoder().encode(row))
    }

    @Test func clientRoundTrips() throws {
        let client = Client(orgId: UUID(), name: "Ana López", preferredLanguage: .es)
        client.phone = "555-0100"
        client.isSenior65Plus = true
        client.smsConsent = .granted
        client.touch()

        let copy = try #require(Client.make(try throughJSON(client.row())))

        #expect(copy.id == client.id)
        #expect(copy.orgId == client.orgId)
        #expect(copy.name == "Ana López")
        #expect(copy.preferredLanguage == .es)
        #expect(copy.isSenior65Plus)
        #expect(copy.smsConsent == .granted)
        #expect(abs(copy.updatedAt.timeIntervalSince(client.updatedAt)) < 0.001, "ms precision survives the wire")
        #expect(!copy.needsSync)
    }

    @Test func moneyStaysExact() throws {
        let line = LineItem(orgId: UUID(), estimateId: UUID(), descriptionEn: "Breaker",
                            qty: try #require(Decimal(string: "2.5")),
                            unitPrice: try #require(Decimal(string: "19.99")), source: .priceBook)
        let row = line.row()
        #expect(row["unit_price"] == .string("19.99"), "money is sent as an exact string")

        var serverRow = row   // the server returns numerics as JSON numbers
        serverRow["unit_price"] = .double(19.99)
        serverRow["qty"] = .double(2.5)
        let copy = try #require(LineItem.make(serverRow))
        #expect(copy.unitPrice == Decimal(string: "19.99"))
        #expect(copy.qty == Decimal(string: "2.5"))
        #expect(copy.source == .priceBook)
    }

    @Test func mediaKeepsDeviceOnlyFileName() {
        let media = Media(orgId: UUID(), jobId: UUID(), kind: .voice, localFileName: "abc.m4a")
        #expect(media.row()["local_file_name"] == nil, "device-only fields never go to the server")

        var row = media.row()
        row["transcript"] = .string("Cambiar panel de 100 a 200 amperios")
        media.apply(row)
        #expect(media.localFileName == "abc.m4a")
        #expect(media.transcript == "Cambiar panel de 100 a 200 amperios")
    }

    @Test func everyTableRebuildsFromItsOwnRow() {
        let org = UUID(), job = UUID()
        let records: [any SyncRecord] = [
            Organization(name: "O"), Member(orgId: org, displayName: "M"), Client(orgId: org, name: "C"),
            Job(orgId: org, title: "J", assignedTo: nil), TimeEntry(orgId: org, jobId: job, memberId: nil),
            PriceBookItem(orgId: org, kind: .labor, nameEn: "P"), Estimate(orgId: org, jobId: job),
            LineItem(orgId: org, estimateId: UUID()), Receipt(orgId: org), Expense(orgId: org, amount: 12),
            ReceiptLineItem(orgId: org, receiptId: UUID(), description: "2x4"),
            Media(orgId: org, jobId: job, kind: .photo, localFileName: nil),
        ]
        for record in records {
            #expect(remake(record) != nil, "\(type(of: record)) can't be rebuilt from its row")
        }
    }

    private func remake<T: SyncRecord>(_ record: T) -> T? { T.make(record.row()) }
}
