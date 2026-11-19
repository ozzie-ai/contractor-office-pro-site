import Foundation
import XCTest
@testable import ContractorOfficePro

final class BackendInterpretationContractTests: XCTestCase {
    private func decode(_ quantityJSON: String) throws -> EstimatingAPIClient.InterpretationResponse {
        let body = """
        {
          "version": 2, "pricing_status": "not_priced",
          "interpretation": {
            "trade":"electrical",
            "project_summary_en":"Replace devices",
            "project_summary_es":"Reemplazar dispositivos",
            "tasks":[{
              "category":"electrical",
              "description_en":"Replace standard wall switches",
              "description_es":"Reemplazar interruptores normales",
              "quantity":\(quantityJSON),
              "unit":"each",
              "specifications":[],
              "status":"included_now",
              "task_code":null
            }],
            "excluded_work":[], "future_work":[], "unknown_details":[],
            "confidence_notes":[]
          }
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(EstimatingAPIClient.InterpretationResponse.self,
                                  from: Data(body.utf8))
    }

    func testPythonNumericQuantityLoadsInSwiftWithoutLosingWorkItem() throws {
        XCTAssertEqual(try decode("2").interpretation.tasks.first?.quantity, "2")
        XCTAssertEqual(try decode("2.5").interpretation.tasks.first?.quantity, "2.5")
    }

    func testLegacyStringQuantityAndMissingQuantityRemainExplicit() throws {
        XCTAssertEqual(try decode("\\"3\\"").interpretation.tasks.first?.quantity, "3")
        XCTAssertNil(try decode("null").interpretation.tasks.first?.quantity)
    }

    func testMalformedQuantityIsRejectedRatherThanInventingZero() {
        XCTAssertThrowsError(try decode("true"))
    }
}
