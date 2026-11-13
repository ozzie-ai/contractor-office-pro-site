import Foundation
import SwiftData

@Model nonisolated
final class Receipt: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var jobId: UUID?
    var store: String?
    var purchasedOn: Date?
    var subtotal: Decimal?
    var tax: Decimal?
    var total: Decimal?
    var imagePath: String?
    var ocrText: String?
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    init(id: UUID = UUID(), orgId: UUID, jobId: UUID? = nil, store: String? = nil, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.jobId = jobId
        self.store = store
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

@Model nonisolated
final class ReceiptLineItem: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var receiptId: UUID
    var sku: String?
    var itemDescription: String
    var qty: Decimal
    var unitPrice: Decimal
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    init(id: UUID = UUID(), orgId: UUID, receiptId: UUID, description: String, qty: Decimal = 1,
         unitPrice: Decimal = 0, sku: String? = nil, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.receiptId = receiptId
        self.itemDescription = description
        self.qty = qty
        self.unitPrice = unitPrice
        self.sku = sku
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

@Model nonisolated
final class Expense: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var jobId: UUID?
    var receiptId: UUID?
    var category: String
    var expenseDescription: String?
    var amount: Decimal
    var spentOn: Date
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    init(id: UUID = UUID(), orgId: UUID, amount: Decimal, category: String = "materials",
         jobId: UUID? = nil, spentOn: Date = .now, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.amount = amount
        self.category = category
        self.jobId = jobId
        self.spentOn = spentOn
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
