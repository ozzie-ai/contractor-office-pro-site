import Foundation
import SwiftUI

/// Decides whether a material on a new list is something already on the truck.
/// Conservative on purpose: sizes/ratings (any word with a digit) must match exactly, so 8 AWG never matches 6 AWG.
nonisolated enum StockMatcher {
    private static let stopwords: Set<String> = ["a", "an", "the", "of", "for", "in", "with", "and", "to",
                                                 "de", "la", "el", "los", "las", "para", "con", "y"]

    static func tokens(_ text: String) -> Set<String> {
        let words = text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty && !stopwords.contains($0) }
        return Set(words.map { $0.count > 3 && $0.hasSuffix("s") && !$0.hasSuffix("ss") ? String($0.dropLast()) : $0 })
    }

    static func unitFamily(_ unit: String) -> String {
        switch unit.trimmed.lowercased() {
        case "ft", "feet", "foot", "lf", "linear ft", "linear feet", "pies", "pie": "ft"
        case "ea", "each", "pc", "pcs", "piece", "pieces", "unit", "units", "pza", "pieza": "each"
        case "box", "boxes", "caja": "box"
        case "gal", "gallon", "gallons", "galón": "gal"
        case let other: other
        }
    }

    /// 0...1 similarity of two names; 0 when their sizes/ratings differ.
    static func similarity(_ a: String, _ b: String) -> Double {
        let ta = tokens(a), tb = tokens(b)
        let sizes = { (t: Set<String>) in t.filter { $0.contains(where: \.isNumber) } }
        guard !ta.isEmpty, !tb.isEmpty, sizes(ta) == sizes(tb) else { return 0 }
        return Double(ta.intersection(tb).count) / Double(ta.union(tb).count)
    }

    static func isSame(_ name: String, _ unit: String, as stock: StockItem) -> Bool {
        unitFamily(unit) == unitFamily(stock.unit) && similarity(name, stock.nameEn) >= 0.75
    }

    /// The best leftover for a material, if any is close enough and not used up.
    static func match(for material: MaterialItem, in stock: [StockItem]) -> StockItem? {
        stock
            .filter { $0.deletedAt == nil && $0.qty > 0 && unitFamily($0.unit) == unitFamily(material.unit) }
            .map { ($0, similarity(material.nameEn, $0.nameEn)) }
            .filter { $0.1 >= 0.6 }
            .max { $0.1 < $1.1 }?.0
    }
}

/// "How much is left?" as big buttons instead of typing.
nonisolated enum LeftoverShare: CaseIterable, Hashable, Sendable {
    case none, little, half, most, all

    var fraction: Decimal {
        switch self {
        case .none: 0
        case .little: Decimal(string: "0.25")!
        case .half: Decimal(string: "0.5")!
        case .most: Decimal(string: "0.75")!
        case .all: 1
        }
    }

    /// Quantity left for a material bought in `qty` (whole units for "each", 2 decimals otherwise).
    func amount(of qty: Decimal, unit: String) -> Decimal {
        let raw = qty * fraction
        let places = StockMatcher.unitFamily(unit) == "each" ? 0 : 2
        return EstimateCalculator.round(raw, places: places)
    }

    @MainActor var title: LocalizedStringResource {
        switch self {
        case .none: .leftoversNone
        case .little: .leftoversLittle
        case .half: .leftoversHalf
        case .most: .leftoversMost
        case .all: .leftoversAll
        }
    }
}

struct StockDraft: Equatable {
    var nameEn = ""
    var qty: Decimal = 1
    var unit = "each"
    var note = ""

    init() {}

    init(_ item: StockItem) {
        nameEn = item.nameEn
        qty = item.qty
        unit = item.unit
        note = item.note ?? ""
    }

    var isValid: Bool { !nameEn.trimmed.isEmpty && qty >= 0 }

    func apply(to item: StockItem) {
        if item.nameEn != nameEn.trimmed {
            item.nameEn = nameEn.trimmed
            item.searchQuery = nameEn.trimmed
        }
        item.qty = qty
        item.unit = unit.trimmed.isEmpty ? "each" : unit.trimmed
        item.note = note.nilIfBlank
    }
}

struct ToolDraft: Equatable {
    var nameEn = ""
    var nameEs = ""
    var category = "other"
    var brand = ""
    var model = ""
    var serialNumber = ""
    var holder = ""
    var notes = ""

    init() {}

    init(_ tool: Tool) {
        nameEn = tool.nameEn
        nameEs = tool.nameEs
        category = tool.category
        brand = tool.brand ?? ""
        model = tool.model ?? ""
        serialNumber = tool.serialNumber ?? ""
        holder = tool.holder ?? ""
        notes = tool.notes ?? ""
    }

    var isValid: Bool { !nameEn.trimmed.isEmpty }

    func apply(to tool: Tool) {
        tool.nameEn = nameEn.trimmed
        tool.nameEs = nameEs.trimmed
        tool.category = category
        tool.brand = brand.nilIfBlank
        tool.model = model.nilIfBlank
        tool.serialNumber = serialNumber.nilIfBlank
        tool.holder = holder.nilIfBlank
        tool.notes = notes.nilIfBlank
    }
}

/// A tool the AI found in a photo, as the contractor approves it.
struct ToolPick: Identifiable, Equatable {
    let id = UUID()
    var photoIndex: Int
    var nameEn: String
    var nameEs: String
    var category: String
    var brand: String?
    var model: String?
    var serialNumber: String?
    var quantity: Int
    var note: String

    init(_ dto: IdentifiedToolDTO, photoOffset: Int = 0) {
        photoIndex = dto.photoIndex + photoOffset
        nameEn = dto.nameEn
        nameEs = dto.nameEs
        category = dto.category
        brand = dto.brand
        model = dto.model
        serialNumber = dto.serialNumber
        quantity = dto.quantity
        note = dto.noteEn
    }
}

enum ToolCategory {
    static let all = ["power_tool", "hand_tool", "cutting", "measuring", "tester", "ladder", "plumbing_tool", "safety",
                      "storage", "other"]

    static func title(_ raw: String) -> LocalizedStringResource {
        switch raw {
        case "power_tool": .toolCategoryPower
        case "hand_tool": .toolCategoryHand
        case "cutting": .toolCategoryCutting
        case "measuring": .toolCategoryMeasuring
        case "tester": .toolCategoryTester
        case "ladder": .toolCategoryLadder
        case "plumbing_tool": .toolCategoryPlumbing
        case "safety": .toolCategorySafety
        case "storage": .toolCategoryStorage
        default: .toolCategoryOther
        }
    }

    static func systemImage(_ raw: String) -> String {
        switch raw {
        case "power_tool": "bolt.fill"
        case "hand_tool": "wrench.and.screwdriver.fill"
        case "cutting": "scissors"
        case "measuring": "ruler.fill"
        case "tester": "gauge.with.dots.needle.33percent"
        case "ladder": "stairs"
        case "plumbing_tool": "drop.fill"
        case "safety": "shield.lefthalf.filled"
        case "storage": "shippingbox.fill"
        default: "hammer.fill"
        }
    }
}

/// Finds tools in photos, five photos per request so each call stays small and fast.
enum ToolFinding {
    static let batchSize = 5

    static func find(in photos: [Data], language: AppLanguage, service: any EstimateService,
                     onProgress: (Int) -> Void = { _ in }) async throws -> [ToolPick] {
        var picks: [ToolPick] = []
        for start in stride(from: 0, to: photos.count, by: batchSize) {
            let batch = Array(photos[start..<min(start + batchSize, photos.count)])
            let images = batch.compactMap(PhotoStore.aiImage(from:))
            guard images.count == batch.count else { throw BackendError.invalidResponse }
            let result = try await service.identifyTools(ToolsRequestBody(images: images, language: language.rawValue))
            picks += result.result.tools.map { ToolPick($0, photoOffset: start) }
            onProgress(min(start + batchSize, photos.count))
        }
        guard !picks.isEmpty else { throw BackendError.nothingFound }
        return picks
    }
}
