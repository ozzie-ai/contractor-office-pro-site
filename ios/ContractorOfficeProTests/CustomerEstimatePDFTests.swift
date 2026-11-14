import Foundation
import PDFKit
import Testing
@testable import ContractorOfficePro

@MainActor
@Suite("Customer estimate PDF privacy")
struct CustomerEstimatePDFTests {
    private func sample(status: String = "ready_for_contractor_review",
                        missing: [String] = []) -> EstimatingAPIClient.PriceResponse {
        let line = EstimatingAPIClient.PriceResponse.Line(
            taskCode: "ELEC.GFCI", quantity: "2", unit: "each",
            descriptionEn: "Replace two GFCI outlets",
            descriptionEs: "Reemplazar dos tomacorrientes GFCI",
            directTotal: "9999.99", sellingTotal: "250.00",
            source: "planning_allowance", preliminary: true, missing: []
        )
        return EstimatingAPIClient.PriceResponse(
            status: status, preliminary: true, currency: "USD",
            customerLanguage: "en", lines: [line],
            mobilizationSellingTotal: nil, directTotal: "9999.99",
            sellingTotal: "250.00", missing: missing,
            warning: "Private internal note SECRET"
        )
    }

    @Test func approvalIsRequired() {
        #expect(throws: CustomerEstimatePDF.Failure.self) {
            try CustomerEstimatePDF.create(from: sample(), approved: false)
        }
    }

    @Test func incompleteEstimatesAreBlocked() {
        #expect(throws: CustomerEstimatePDF.Failure.self) {
            try CustomerEstimatePDF.create(
                from: sample(status: "incomplete", missing: ["quantity unknown"]),
                approved: true
            )
        }
    }

    @Test func pdfUsesReviewedScopeAndTotalOnly() throws {
        let url = try CustomerEstimatePDF.create(from: sample(), approved: true)
        defer { try? FileManager.default.removeItem(at: url) }
        let document = try #require(PDFDocument(url: url))
        let text = try #require(document.string)
        #expect(text.contains("Replace two GFCI outlets"))
        #expect(text.contains("250.00"))
        #expect(!text.contains("9999.99"))
        #expect(!text.contains("SECRET"))
        #expect(!text.contains("planning_allowance"))
    }
}
