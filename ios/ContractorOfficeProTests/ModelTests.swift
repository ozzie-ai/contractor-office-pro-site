import Foundation
import SwiftData
import Testing
@testable import ContractorOfficePro

@Suite("Local models")
struct ModelTests {
    let context: ModelContext

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
    }

    @Test func organizationOrgIDIsItsOwnID() {
        let org = Organization(name: "Flores Construction")
        #expect(org.orgId == org.id)
    }

    @Test func touchStampsMillisecondTimeAndMarksDirty() {
        let client = Client(orgId: UUID(), name: "Ana", now: Date(timeIntervalSince1970: 0))
        client.needsSync = false
        context.insert(client)

        client.touch(now: Date(timeIntervalSince1970: 100.123456))

        #expect(client.updatedAt == Date(timeIntervalSince1970: 100.123))
        #expect(client.needsSync)
    }

    @Test func softDeleteKeepsRowButHidesItFromLiveQueries() throws {
        let orgID = UUID()
        let keep = Client(orgId: orgID, name: "Keep")
        let gone = Client(orgId: orgID, name: "Gone")
        context.insert(keep)
        context.insert(gone)
        gone.softDelete()
        try context.save()

        let all = try context.fetch(FetchDescriptor<Client>())
        let live = try context.fetch(FetchDescriptor<Client>(predicate: #Predicate { $0.deletedAt == nil }))
        #expect(all.count == 2)
        #expect(live.map(\.name) == ["Keep"])
        #expect(gone.needsSync)
    }

    @Test func enumsStoreTheServerSpelling() {
        let job = Job(orgId: UUID(), title: "Kitchen", assignedTo: UUID())
        job.status = .inProgress
        #expect(job.statusRaw == "in_progress")
        #expect(LineItem(orgId: UUID(), estimateId: UUID(), source: .priceBook).sourceRaw == "price_book")
    }

    @Test func jobsCanBeQueriedByClient() throws {
        let orgID = UUID(), clientID = UUID()
        context.insert(Job(orgId: orgID, clientId: clientID, title: "Deck", assignedTo: nil))
        context.insert(Job(orgId: orgID, clientId: UUID(), title: "Fence", assignedTo: nil))
        try context.save()

        let jobs = try context.fetch(FetchDescriptor<Job>(predicate: #Predicate { $0.clientId == clientID }))
        #expect(jobs.map(\.title) == ["Deck"])
    }
}

@Suite("Estimate math")
struct EstimateCalculatorTests {
    @Test func roundsPerLineAndTaxesOnlyTaxableLines() throws {
        let totals = EstimateCalculator.totals(lines: [
            .init(qty: 3, unitPrice: try #require(Decimal(string: "19.995")), taxable: true),   // 59.985 → 59.99
            .init(qty: try #require(Decimal(string: "12.5")), unitPrice: 85, taxable: false),   // labor 1062.50
        ], taxRate: try #require(Decimal(string: "0.0725")))                                   // 4.349 → 4.35
        #expect(totals.subtotal == Decimal(string: "1122.49"))
        #expect(totals.tax == Decimal(string: "4.35"))
        #expect(totals.total == Decimal(string: "1126.84"))
    }

    @Test func applyIgnoresDeletedLinesAndOtherEstimates() {
        let orgID = UUID()
        let estimate = Estimate(orgId: orgID, jobId: UUID())
        let kept = LineItem(orgId: orgID, estimateId: estimate.id, qty: 1, unitPrice: 100)
        let deleted = LineItem(orgId: orgID, estimateId: estimate.id, qty: 1, unitPrice: 999)
        deleted.softDelete()
        let other = LineItem(orgId: orgID, estimateId: UUID(), qty: 1, unitPrice: 500)

        EstimateCalculator.apply(to: estimate, lineItems: [kept, deleted, other], taxRate: 0)

        #expect(estimate.total == 100)
        #expect(estimate.needsSync)
    }
}
