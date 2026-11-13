import Foundation
import SwiftData

/// Frozen copy of the models that changed in V2, exactly as they shipped in V1.
/// Never edit these: SwiftData uses them to open and migrate old stores.
nonisolated enum SchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] {
        [Organization.self, Member.self, Client.self, Job.self, TimeEntry.self, SchemaV1.PriceBookItem.self,
         SchemaV1.Estimate.self, SchemaV1.LineItem.self, Receipt.self, ReceiptLineItem.self, Expense.self, Media.self]
    }

    @Model nonisolated final class PriceBookItem {
        @Attribute(.unique) var id: UUID
        var orgId: UUID
        var kindRaw: String
        var nameEn: String
        var nameEs: String?
        var unit: String
        var unitCost: Decimal
        var unitPrice: Decimal
        var markupPct: Decimal?
        var category: String?
        var createdAt: Date
        var updatedAt: Date
        var serverUpdatedAt: Date?
        var deletedAt: Date?
        var needsSync: Bool

        init(id: UUID = UUID(), orgId: UUID, nameEn: String, now: Date = .now) {
            self.id = id; self.orgId = orgId; self.kindRaw = "other"; self.nameEn = nameEn; self.unit = "ea"
            self.unitCost = 0; self.unitPrice = 0; self.createdAt = now; self.updatedAt = now; self.needsSync = true
        }
    }

    @Model nonisolated final class Estimate {
        @Attribute(.unique) var id: UUID
        var orgId: UUID
        var jobId: UUID
        var number: String?
        var statusRaw: String
        var languageRaw: String
        var subtotal: Decimal
        var tax: Decimal
        var total: Decimal
        var depositAmount: Decimal?
        var sentAt: Date?
        var acceptedAt: Date?
        var createdAt: Date
        var updatedAt: Date
        var serverUpdatedAt: Date?
        var deletedAt: Date?
        var needsSync: Bool

        init(id: UUID = UUID(), orgId: UUID, jobId: UUID, now: Date = .now) {
            self.id = id; self.orgId = orgId; self.jobId = jobId; self.statusRaw = "draft"; self.languageRaw = "en"
            self.subtotal = 0; self.tax = 0; self.total = 0; self.createdAt = now; self.updatedAt = now; self.needsSync = true
        }
    }

    @Model nonisolated final class LineItem {
        @Attribute(.unique) var id: UUID
        var orgId: UUID
        var estimateId: UUID
        var priceBookItemId: UUID?
        var position: Int
        var descriptionEn: String
        var descriptionEs: String
        var qty: Decimal
        var unit: String
        var unitPrice: Decimal
        var taxable: Bool
        var sourceRaw: String
        var createdAt: Date
        var updatedAt: Date
        var serverUpdatedAt: Date?
        var deletedAt: Date?
        var needsSync: Bool

        init(id: UUID = UUID(), orgId: UUID, estimateId: UUID, descriptionEn: String, now: Date = .now) {
            self.id = id; self.orgId = orgId; self.estimateId = estimateId; self.position = 0
            self.descriptionEn = descriptionEn; self.descriptionEs = ""; self.qty = 1; self.unit = "ea"
            self.unitPrice = 0; self.taxable = true; self.sourceRaw = "manual"
            self.createdAt = now; self.updatedAt = now; self.needsSync = true
        }
    }
}
