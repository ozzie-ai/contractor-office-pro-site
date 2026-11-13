import XCTest

/// Fails if any key in the String Catalog lacks a translated EN and ES value.
final class LocalizationTests: XCTestCase {
    private var catalogURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("ContractorOfficePro/Resources/Localizable.xcstrings")
    }

    func testEveryKeyHasEnglishAndSpanish() throws {
        let data = try Data(contentsOf: catalogURL)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: Any])
        XCTAssertFalse(strings.isEmpty)

        var missing: [String] = []
        for (key, value) in strings {
            let locs = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            for lang in ["en", "es"] {
                let unit = (locs[lang] as? [String: Any])?["stringUnit"] as? [String: Any]
                let state = unit?["state"] as? String
                let text = unit?["value"] as? String ?? ""
                if state != "translated" || text.isEmpty { missing.append("\(key) [\(lang)]") }
            }
        }
        XCTAssertTrue(missing.isEmpty, "Missing translations: \(missing.sorted())")
    }

    func testSpanishLookupWorksAtRuntime() throws {
        let path = try XCTUnwrap(Bundle(for: ContractorOfficeProTestsAnchor.self).path(forResource: "es", ofType: "lproj")
            ?? Bundle.main.path(forResource: "es", ofType: "lproj"))
        let es = try XCTUnwrap(Bundle(path: path))
        XCTAssertEqual(es.localizedString(forKey: "home.welcome", value: nil, table: nil), "Bienvenido")
    }
}

private final class ContractorOfficeProTestsAnchor {}
