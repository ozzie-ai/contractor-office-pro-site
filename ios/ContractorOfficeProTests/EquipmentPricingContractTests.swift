import Foundation
import XCTest
@testable import ContractorOfficePro

final class EquipmentPricingContractTests: XCTestCase {
    func testEquipmentCostEncodesForSharedPricingEngine() throws {
        let cost = EstimatingAPIClient.DirectCost(
            laborHoursPerUnit: 1.5, loadedLaborRate: 65,
            materialCostPerUnit: 25, equipmentCostPerUnit: 40,
            source: "contractor_entered"
        )
        let coder = JSONEncoder()
        coder.keyEncodingStrategy = .convertToSnakeCase
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: coder.encode(cost)) as? [String: Any])
        XCTAssertEqual(Decimal(string: String(describing: object["equipment_cost_per_unit"] ?? "")), 40)
        XCTAssertEqual(Decimal(string: String(describing: object["material_cost_per_unit"] ?? "")), 25)
    }

    func testOlderReviewDraftWithoutEquipmentStillDecodes() throws {
        let raw = """
        {"version":1,"items":[{"taskCode":"switch","descriptionEn":"Replace switch",
        "descriptionEs":"","scopeID":"","quantity":"2","unit":"each",
        "laborHours":"1","laborRate":"50","materialCost":"15",
        "selectedRateID":"","priceSource":"contractor_entered",
        "requiresConfirmation":false,"confirmed":true}],
        "unknowns":[],"resolvedUnknowns":[],"exclusions":[],
        "overhead":"10","profit":"20","tripCost":"0","customerLanguage":"en"}
        """
        let decoded = try JSONDecoder().decode(EstimateReviewDraft.self, from: Data(raw.utf8))
        XCTAssertNil(decoded.items.first?.equipmentCost)
    }
}
