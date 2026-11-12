import Foundation
import SwiftData

enum AppSchema {
    /// Push order respects foreign keys (parents before children).
    static let models: [any PersistentModel.Type] = [
        Organization.self, Member.self, Client.self, Job.self, TimeEntry.self, PriceBookItem.self,
        Estimate.self, LineItem.self, Receipt.self, ReceiptLineItem.self, Expense.self, Media.self,
    ]

    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        return try ModelContainer(for: Schema(models), configurations: config)
    }
}
