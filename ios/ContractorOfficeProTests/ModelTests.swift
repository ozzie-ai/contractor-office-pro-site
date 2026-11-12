import SwiftData
import XCTest
@testable import ContractorOfficePro

@MainActor
final class ModelTests: XCTestCase {
    private var context: ModelContext!

    override func setUp() async throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
    }

    func testOrganizationOrgIdIsItsOwnId() {
        let org = Organization(name: "Flores Construction")
        XCTAssertEqual(org.orgId, org.id)
    }

    func testTouchStampsUpdatedAtAndMarksDirty() throws {
        let org = Organization(name: "Org")
        let client = Client(orgId: org.id, name: "Ana", now: Date(timeIntervalSince1970: 0))
        client.needsSync = false
        context.insert(client)

        let later = Date(timeIntervalSince1970: 100)
        client.phone = "555-0100"
        client.touch(now: later)

        XCTAssertEqual(client.updatedAt, later)
        XCTAssertTrue(client.needsSync)
    }

    func testSoftDeleteKeepsRowButHidesItFromLiveQueries() throws {
        let orgId = UUID()
        let keep = Client(orgId: orgId, name: "Keep")
        let gone = Client(orgId: orgId, name: "Gone")
        context.insert(keep)
        context.insert(gone)
        gone.softDelete()
        try context.save()

        let all = try context.fetch(FetchDescriptor<Client>())
        let live = try context.fetch(FetchDescriptor<Client>(predicate: #Predicate { $0.deletedAt == nil }))
        XCTAssertEqual(all.count, 2)
        XCTAssertEqual(live.map(\.name), ["Keep"])
        XCTAssertTrue(gone.needsSync)
    }

    func testEnumsRoundTripThroughRawStorage() {
        let job = Job(orgId: UUID(), title: "Kitchen", assignedTo: UUID())
        job.status = .inProgress
        XCTAssertEqual(job.statusRaw, "in_progress")
        let line = LineItem(orgId: UUID(), estimateId: UUID(), source: .priceBook)
        XCTAssertEqual(line.sourceRaw, "price_book")
    }

    func testJobsCanBeQueriedByClientAndAssignee() throws {
        let orgId = UUID(), ownerId = UUID(), clientId = UUID()
        context.insert(Job(orgId: orgId, clientId: clientId, title: "Deck", assignedTo: ownerId))
        context.insert(Job(orgId: orgId, clientId: UUID(), title: "Fence", assignedTo: ownerId))
        try context.save()

        let forClient = try context.fetch(FetchDescriptor<Job>(predicate: #Predicate { $0.clientId == clientId }))
        XCTAssertEqual(forClient.map(\.title), ["Deck"])
    }
}

final class EstimateCalculatorTests: XCTestCase {
    func testTotalsRoundPerLineAndTaxOnlyTaxableLines() {
        let totals = EstimateCalculator.totals(lines: [
            .init(qty: 3, unitPrice: Decimal(string: "19.995")!, taxable: true),   // 59.985 → 59.99
            .init(qty: Decimal(string: "12.5")!, unitPrice: 85, taxable: false),    // labor 1062.50
        ], taxRate: Decimal(string: "0.0725")!)                                     // 59.99 × 7.25% = 4.349 → 4.35
        XCTAssertEqual(totals.subtotal, Decimal(string: "1122.49"))
        XCTAssertEqual(totals.tax, Decimal(string: "4.35"))
        XCTAssertEqual(totals.total, Decimal(string: "1126.84"))
    }

    func testApplyIgnoresDeletedLinesAndOtherEstimates() {
        let orgId = UUID()
        let estimate = Estimate(orgId: orgId, jobId: UUID())
        let a = LineItem(orgId: orgId, estimateId: estimate.id, qty: 1, unitPrice: 100)
        let deleted = LineItem(orgId: orgId, estimateId: estimate.id, qty: 1, unitPrice: 999)
        deleted.softDelete()
        let other = LineItem(orgId: orgId, estimateId: UUID(), qty: 1, unitPrice: 500)

        EstimateCalculator.apply(to: estimate, lineItems: [a, deleted, other], taxRate: 0)
        XCTAssertEqual(estimate.total, 100)
        XCTAssertTrue(estimate.needsSync)
    }
}
