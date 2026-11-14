import Foundation
import SwiftData
import Testing
@testable import ContractorOfficePro

@MainActor
@Suite("Approved job estimate persistence")
struct EstimatePersistenceTests {
    @Test func reviewedLinesAndTotalAreSavedWithoutPrivateCosts() throws {
        let container = try AppSchema.makeContainer(inMemory: true)
        let context = container.mainContext
        let orgID = UUID()
        let memberID = UUID()
        let job = Job(orgId: orgID, title: "Receptacle replacement", assignedTo: memberID)
        context.insert(job)
        try context.save()

        let backend = FakeBackend()
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID,
                              defaults: PreviewData.ephemeralDefaults())
        let workspace = Workspace(orgID: orgID, memberID: memberID, context: context, sync: sync)

        let lines = [
            EstimatingAPIClient.PriceResponse.Line(
                taskCode: "ELEC.STANDARD", quantity: "3", unit: "each",
                descriptionEn: "Replace three standard outlets",
                descriptionEs: "Reemplazar tres tomacorrientes estándar",
                directTotal: "153.00", sellingTotal: "201.96",
                source: "contractor_entered", preliminary: true, missing: []
            ),
            EstimatingAPIClient.PriceResponse.Line(
                taskCode: "ELEC.GFCI", quantity: "2", unit: "each",
                descriptionEn: "Replace two GFCI outlets",
                descriptionEs: "Reemplazar dos tomacorrientes GFCI",
                directTotal: "150.00", sellingTotal: "198.00",
                source: "contractor_entered", preliminary: true, missing: []
            ),
        ]
        let result = EstimatingAPIClient.PriceResponse(
            status: "ready_for_contractor_review", preliminary: true, currency: "USD",
            customerLanguage: "en", lines: lines,
            mobilizationSellingTotal: "99.00", directTotal: "378.00",
            sellingTotal: "498.96", missing: [], warning: "PRIVATE LABOR RATE 60"
        )
        #expect(throws: Workspace.EstimateSaveError.self) {
            try workspace.saveApprovedEstimate(result, for: job, approved: false)
        }
        let saved = try workspace.saveApprovedEstimate(result, for: job, approved: true)
        #expect(saved.total == Decimal(string: "498.96"))
        #expect(saved.jobId == job.id)
        #expect(saved.status == .draft)

        let persisted = try context.fetch(FetchDescriptor<LineItem>())
        #expect(persisted.count == 3)
        #expect(persisted.filter { $0.descriptionEn.contains("GFCI") }.first?.qty == 2)
        #expect(persisted.filter { $0.descriptionEn.contains("standard") }.first?.qty == 3)
        #expect(persisted.allSatisfy { !$0.descriptionEn.contains("PRIVATE LABOR RATE") })
    }

    @Test func rejectingWrongOrganizationDoesNotWriteAnything() throws {
        let container = try AppSchema.makeContainer(inMemory: true)
        let context = container.mainContext
        let orgID = UUID(), anotherOrg = UUID()
        let job = Job(orgId: anotherOrg, title: "Other business job", assignedTo: nil)
        context.insert(job)
        let workspace = Workspace(
            orgID: orgID, memberID: UUID(), context: context,
            sync: SyncEngine(transport: FakeBackend(), context: context,
                             orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        )
        let result = EstimatingAPIClient.PriceResponse(
            status: "ready_for_contractor_review", preliminary: true,
            currency: "USD", customerLanguage: "en", lines: [],
            mobilizationSellingTotal: nil, directTotal: "100.00",
            sellingTotal: "100.00", missing: [], warning: ""
        )
        #expect(throws: Workspace.EstimateSaveError.self) {
            try workspace.saveApprovedEstimate(result, for: job, approved: true)
        }
        #expect(try context.fetch(FetchDescriptor<Estimate>()).isEmpty)
    }
}
