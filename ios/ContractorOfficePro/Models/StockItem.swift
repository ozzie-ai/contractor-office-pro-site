import Foundation
import SwiftData

/// Leftover material on the truck/in the shop, saved when a job is done and offered on the next materials list.
@Model nonisolated
final class StockItem: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var nameEn: String
    var nameEs: String
    var category: String
    var qty: Decimal
    var unit: String
    var specifications: String?
    var searchQuery: String
    /// The estimate (job) it was left over from, if any.
    var sourceEstimateId: UUID?
    var note: String?
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    init(id: UUID = UUID(), orgId: UUID, nameEn: String, nameEs: String = "", category: String = "other",
         qty: Decimal = 0, unit: String = "each", searchQuery: String = "", now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.nameEn = nameEn
        self.nameEs = nameEs
        self.category = category
        self.qty = qty
        self.unit = unit
        self.searchQuery = searchQuery.isEmpty ? nameEn : searchQuery
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

/// A tool the business owns. The photo is device-only; text fields sync.
@Model nonisolated
final class Tool: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var nameEn: String
    var nameEs: String
    var category: String
    var brand: String?
    var model: String?
    var serialNumber: String?
    /// Who has it or where it is: "Me", "Carlos", "Ana's job". Nil = in the shop/truck.
    var holder: String?
    var notes: String?
    /// Local-only: file name in PhotoStore. Not synced.
    var photoFileName: String?
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    init(id: UUID = UUID(), orgId: UUID, nameEn: String, nameEs: String = "", category: String = "other", now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.nameEn = nameEn
        self.nameEs = nameEs
        self.category = category
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
