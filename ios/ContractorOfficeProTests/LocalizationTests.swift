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

/// Every dotted key literal used in app source (e.g. "auth.title") must exist in the catalog.
final class LocalizationCoverageTests: XCTestCase {
    func testAllKeysUsedInSourceExistInCatalog() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let appDir = root.appendingPathComponent("ContractorOfficePro")
        let catalogData = try Data(contentsOf: appDir.appendingPathComponent("Resources/Localizable.xcstrings"))
        let catalog = try XCTUnwrap(JSONSerialization.jsonObject(with: catalogData) as? [String: Any])
        let keys = Set((catalog["strings"] as? [String: Any] ?? [:]).keys)

        let pattern = try NSRegularExpression(pattern: #""([a-z]+(?:\.[a-z_]+)+)""#)
        var missing: Set<String> = []
        let files = FileManager.default.enumerator(at: appDir, includingPropertiesForKeys: nil)!
        for case let file as URL in files where file.pathExtension == "swift" {
            let text = try String(contentsOf: file, encoding: .utf8)
            for match in pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                let key = String(text[Range(match.range(at: 1), in: text)!])
                if key.hasPrefix("com.") || key.hasSuffix(".swift") { continue }
                // SF Symbol names aren't user-facing text.
                let before = text[..<Range(match.range, in: text)!.lowerBound].suffix(14)
                if before.hasSuffix("systemName: ") || before.hasSuffix("systemImage: ") { continue }
                if !keys.contains(key) { missing.insert(key) }
            }
        }
        XCTAssertTrue(missing.isEmpty, "Keys used in code but missing from Localizable.xcstrings: \(missing.sorted())")
    }
}
