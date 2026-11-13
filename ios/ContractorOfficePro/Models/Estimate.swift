import Foundation
import SwiftData

@Model nonisolated
final class PriceBookItem: Syncable {
    enum Kind: String, Codable, CaseIterable, Sendable { case labor, material, markup, other }

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

    var kind: Kind {
        get { Kind(rawValue: kindRaw) ?? .other }
        set { kindRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, kind: Kind, nameEn: String, nameEs: String? = nil, unit: String = "ea",
         unitCost: Decimal = 0, unitPrice: Decimal = 0, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.kindRaw = kind.rawValue
        self.nameEn = nameEn
        self.nameEs = nameEs
        self.unit = unit
        self.unitCost = unitCost
        self.unitPrice = unitPrice
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

@Model nonisolated
final class Estimate: Syncable {
    enum Status: String, Codable, CaseIterable, Sendable { case draft, sent, accepted, declined }

    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var jobId: UUID
    var number: String?
    var statusRaw: String
    var languageRaw: String
    /// Cached totals. Always written by EstimateCalculator, never by an LLM.
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

    var status: Status {
        get { Status(rawValue: statusRaw) ?? .draft }
        set { statusRaw = newValue.rawValue }
    }

    var language: AppLanguage {
        get { AppLanguage(rawValue: languageRaw) ?? .en }
        set { languageRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, jobId: UUID, language: AppLanguage = .en, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.jobId = jobId
        self.statusRaw = Status.draft.rawValue
        self.languageRaw = language.rawValue
        self.subtotal = 0
        self.tax = 0
        self.total = 0
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

@Model nonisolated
final class LineItem: Syncable {
    /// Where the line came from; shown to the contractor (AI vs. price book vs. typed).
    enum Source: String, Codable, CaseIterable, Sendable { case ai, priceBook = "price_book", manual }

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

    var source: Source {
        get { Source(rawValue: sourceRaw) ?? .manual }
        set { sourceRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, estimateId: UUID, position: Int = 0, descriptionEn: String = "",
         descriptionEs: String = "", qty: Decimal = 1, unit: String = "ea", unitPrice: Decimal = 0,
         taxable: Bool = true, source: Source = .manual, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.estimateId = estimateId
        self.position = position
        self.descriptionEn = descriptionEn
        self.descriptionEs = descriptionEs
        self.qty = qty
        self.unit = unit
        self.unitPrice = unitPrice
        self.taxable = taxable
        self.sourceRaw = source.rawValue
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
