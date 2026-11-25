import Foundation
import XCTest
@testable import ContractorOfficePro

final class PrivateEstimateReviewStoreTests: XCTestCase {
    @MainActor
    func testUnapprovedContractorDraftSurvivesSaveAndReload() {
        let id = UUID()
        defer { PrivateEstimateReviewStore.clear(jobID: id) }
        let row = EstimateReviewDraft.Item(
            taskCode: "electrical.switch", descriptionEn: "Replace wall switch",
            descriptionEs: "Reemplazar interruptor", scopeID: "Kitchen",
            quantity: "2", unit: "each", laborHours: "0.75",
            laborRate: "62", materialCost: "15", selectedRateID: "",
            priceSource: "planning_allowance", requiresConfirmation: true,
            confirmed: false)
        let review = EstimateReviewDraft(items: [row], unknowns: ["Check wiring"],
            resolvedUnknowns: [], exclusions: ["New circuit"],
            overhead: "10", profit: "20", tripCost: "0", customerLanguage: "es")
        XCTAssertTrue(PrivateEstimateReviewStore.save(review, jobID: id))
        let reopened = PrivateEstimateReviewStore.load(jobID: id)
        XCTAssertEqual(reopened, review)
        XCTAssertEqual(reopened?.items.first?.confirmed, false)
        XCTAssertEqual(reopened?.items.first?.materialCost, "15")
        XCTAssertEqual(reopened?.unknowns, ["Check wiring"])
    }

    @MainActor
    func testDeleteClearsPrivateReview() {
        let id = UUID()
        let review = EstimateReviewDraft(items: [], unknowns: [],
            resolvedUnknowns: [], exclusions: [], overhead: "0",
            profit: "0", tripCost: "0", customerLanguage: "en")
        XCTAssertTrue(PrivateEstimateReviewStore.save(review, jobID: id))
        PrivateEstimateReviewStore.clear(jobID: id)
        XCTAssertNil(PrivateEstimateReviewStore.load(jobID: id))
    }

    @MainActor
    func testRefusesUnboundedWorkItems() {
        let id = UUID()
        defer { PrivateEstimateReviewStore.clear(jobID: id) }
        let item = EstimateReviewDraft.Item(
            taskCode: "other", descriptionEn: "Work", descriptionEs: "",
            scopeID: "", quantity: "1", unit: "each", laborHours: "",
            laborRate: "", materialCost: "", selectedRateID: "",
            priceSource: "planning_allowance", requiresConfirmation: false,
            confirmed: false)
        let review = EstimateReviewDraft(items: Array(repeating: item, count: 101),
            unknowns: [], resolvedUnknowns: [], exclusions: [],
            overhead: "0", profit: "0", tripCost: "0", customerLanguage: "en")
        XCTAssertFalse(PrivateEstimateReviewStore.save(review, jobID: id))
    }
}
