import Foundation
import SwiftData

enum AppSchema {
    /// Push order respects foreign keys (parents before children).
    static let models: [any PersistentModel.Type] = SchemaV1.models

    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        return try ModelContainer(for: Schema(versionedSchema: SchemaV1.self),
                                  migrationPlan: AppMigrationPlan.self,
                                  configurations: config)
    }
}

/// swiftdata skill: version the schema before real data exists, so later changes get a migration stage.
nonisolated enum SchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] {
        [Organization.self, Member.self, Client.self, Job.self, TimeEntry.self, PriceBookItem.self,
         Estimate.self, LineItem.self, Receipt.self, ReceiptLineItem.self, Expense.self, Media.self]
    }
}

nonisolated enum AppMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [SchemaV1.self] }
    static var stages: [MigrationStage] { [] }
}
