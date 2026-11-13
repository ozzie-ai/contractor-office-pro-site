import Foundation
import SwiftData

/// One line of an estimate's bill of materials (AI draft, contractor-edited). Never priced by the AI.
@Model nonisolated
final class MaterialItem: Syncable {
    enum Evidence: String, Codable, Sendable { case stated, inferred, manual }

    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var estimateId: UUID
    var position: Int
    var nameEn: String
    var nameEs: String
    var category: String
    /// 0 means the quantity isn't known yet.
    var qty: Decimal
    var unit: String
    /// One spec per line, e.g. "8 AWG" / "Copper THHN".
    var specifications: String?
    var searchQuery: String
    var evidenceRaw: String
    var note: String?
    var purchased: Bool
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var evidence: Evidence {
        get { Evidence(rawValue: evidenceRaw) ?? .manual }
        set { evidenceRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, estimateId: UUID, position: Int = 0, nameEn: String, nameEs: String = "",
         category: String = "other", qty: Decimal = 0, unit: String = "each", searchQuery: String = "",
         evidence: Evidence = .manual, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.estimateId = estimateId
        self.position = position
        self.nameEn = nameEn
        self.nameEs = nameEs
        self.category = category
        self.qty = qty
        self.unit = unit
        self.searchQuery = searchQuery.isEmpty ? nameEn : searchQuery
        self.evidenceRaw = evidence.rawValue
        self.purchased = false
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
