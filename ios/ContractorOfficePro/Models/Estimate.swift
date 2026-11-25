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
    /// Catalog task this price is for (e.g. ELEC.GFCI); the pricing service uses it as "your price".
    var taskCode: String?
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
    /// Private: the contractor's dictation/notes. Never on customer documents.
    var internalNotes: String?
    /// Customer-facing exclusions and future work, one per line.
    var exclusions: String?
    /// Private: questions the AI couldn't answer from the notes (JSON of `OpenQuestion`, or legacy one per line).
    var openQuestions: String?
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
    var taskCode: String?
    /// Where the unit price came from: contractor / reference / ai_estimate / manual / none.
    var priceSourceRaw: String = "manual"
    var priceNote: String?
    var preliminary: Bool = false
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var source: Source {
        get { Source(rawValue: sourceRaw) ?? .manual }
        set { sourceRaw = newValue.rawValue }
    }

    /// `.aiEstimate`: an AI ballpark (code-computed from AI cost inputs). Preliminary until the contractor confirms it.
    enum PriceSource: String, Codable, CaseIterable, Sendable { case contractor, reference, aiEstimate = "ai_estimate", manual, none }

    var priceSource: PriceSource {
        get { PriceSource(rawValue: priceSourceRaw) ?? .manual }
        set { priceSourceRaw = newValue.rawValue }
    }

    var needsPrice: Bool { priceSource == .none }
    var isAIBallpark: Bool { priceSource == .aiEstimate }
    var needsQuantity: Bool { qty == 0 }
    var lineTotal: Decimal { EstimateCalculator.lineTotal(qty: qty, unitPrice: unitPrice) }

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
