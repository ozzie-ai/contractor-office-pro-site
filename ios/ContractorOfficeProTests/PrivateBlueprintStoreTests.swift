import Foundation
import XCTest
@testable import ContractorOfficePro

nonisolated final class PrivateBlueprintStoreTests: XCTestCase {
    func testPrivateBlueprintSurvivesReopeningJobAndCanBeDeleted() throws {
        let jobID = UUID()
        defer { PrivateBlueprintStore.clear(jobID: jobID) }
        let bytes = Data("%PDF-1.4\n1 0 obj\n".utf8)
        let url = try PrivateBlueprintStore.save(bytes, jobID: jobID)
        XCTAssertEqual(PrivateBlueprintStore.load(jobID: jobID), url)
        XCTAssertEqual(try Data(contentsOf: url), bytes)
        PrivateBlueprintStore.clear(jobID: jobID)
        XCTAssertNil(PrivateBlueprintStore.load(jobID: jobID))
    }

    func testRejectsNonPDFBytes() {
        XCTAssertThrowsError(try PrivateBlueprintStore.save(Data("not a PDF".utf8), jobID: UUID()))
    }

    func testRejectsOversizedBlueprint() {
        let id = UUID()
        defer { PrivateBlueprintStore.clear(jobID: id) }
        let tooLarge = Data("%PDF-".utf8) + Data(repeating: 0, count: PrivateBlueprintStore.maxBytes)
        XCTAssertThrowsError(try PrivateBlueprintStore.save(tooLarge, jobID: id))
    }
}
