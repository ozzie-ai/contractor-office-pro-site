import Foundation
import Testing
@testable import ContractorOfficePro

/// Keys are compile-checked by generated symbols; these tests check translations are complete.
@Suite("Localization")
struct LocalizationTests {
    private static let catalogURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("ContractorOfficePro/Resources/Localizable.xcstrings")

    @Test("Every key has translated English and Spanish, including plural forms")
    func everyKeyIsTranslated() throws {
        let json = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: Self.catalogURL)) as? [String: Any])
        let strings = try #require(json["strings"] as? [String: Any])
        #expect(!strings.isEmpty)

        var missing: [String] = []
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            for language in ["en", "es"] where !Self.isTranslated(localizations[language]) {
                missing.append("\(key) [\(language)]")
            }
        }
        #expect(missing.isEmpty, "Missing translations: \(missing.sorted())")
    }

    @Test func spanishResolvesAtRuntime() throws {
        let path = try #require(Bundle.main.path(forResource: "es", ofType: "lproj"))
        let spanish = try #require(Bundle(path: path))
        #expect(spanish.localizedString(forKey: "home.welcome", value: nil, table: nil) == "Bienvenido")
    }

    @Test(arguments: [(1, "1 cambio pendiente de subir"), (3, "3 cambios pendientes de subir")])
    func spanishPlurals(count: Int, expected: String) throws {
        let path = try #require(Bundle.main.path(forResource: "es", ofType: "lproj"))
        let spanish = try #require(Bundle(path: path))
        let format = spanish.localizedString(forKey: "sync.pending", value: nil, table: nil)
        #expect(String.localizedStringWithFormat(format, count) == expected)
    }

    private static func isTranslated(_ localization: Any?) -> Bool {
        guard let localization = localization as? [String: Any] else { return false }
        if let unit = localization["stringUnit"] as? [String: Any] { return isTranslatedUnit(unit) }
        if let plural = (localization["variations"] as? [String: Any])?["plural"] as? [String: Any] {
            return plural["other"] != nil && plural.values.allSatisfy {
                isTranslatedUnit(($0 as? [String: Any])?["stringUnit"] as? [String: Any])
            }
        }
        return false
    }

    private static func isTranslatedUnit(_ unit: [String: Any]?) -> Bool {
        unit?["state"] as? String == "translated" && !((unit?["value"] as? String) ?? "").isEmpty
    }
}
