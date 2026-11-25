import Foundation
import SwiftData

enum AppSchema {
    /// Push order respects foreign keys (parents before children).
    static let models: [any PersistentModel.Type] = SchemaV3.models

    static func makeContainer(inMemory: Bool = false, url: URL? = nil) throws -> ModelContainer {
        let config = if let url { ModelConfiguration(url: url) } else { ModelConfiguration(isStoredInMemoryOnly: inMemory) }
        return try ModelContainer(for: Schema(versionedSchema: SchemaV3.self),
                                  migrationPlan: AppMigrationPlan.self,
                                  configurations: config)
    }
}

/// V2: AI/pricing metadata on estimates and line items, task codes on price book items. All additive.
nonisolated enum SchemaV2: VersionedSchema {
    static let versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] {
        [Organization.self, Member.self, Client.self, Job.self, TimeEntry.self, PriceBookItem.self,
         Estimate.self, LineItem.self, Receipt.self, ReceiptLineItem.self, Expense.self, Media.self]
    }
}

/// V3: adds MaterialItem (bill of materials). Purely additive, so V2's model types are unchanged.
nonisolated enum SchemaV3: VersionedSchema {
    static let versionIdentifier = Schema.Version(3, 0, 0)
    static var models: [any PersistentModel.Type] { SchemaV2.models + [MaterialItem.self] }
}

nonisolated enum AppMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [SchemaV1.self, SchemaV2.self, SchemaV3.self] }
    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: SchemaV1.self, toVersion: SchemaV2.self),
         .lightweight(fromVersion: SchemaV2.self, toVersion: SchemaV3.self)]
    }
}
