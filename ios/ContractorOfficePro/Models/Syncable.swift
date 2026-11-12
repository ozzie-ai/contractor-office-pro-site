import Foundation
import SwiftData

/// Columns every synced table shares (mirrors the Supabase schema).
/// See docs/decisions/0001-offline-sync-lww.md.
protocol Syncable: PersistentModel {
    var id: UUID { get }
    var orgId: UUID { get }
    var createdAt: Date { get }
    var updatedAt: Date { get set }
    var serverUpdatedAt: Date? { get set }
    var deletedAt: Date? { get set }
    var needsSync: Bool { get set }
}

extension Syncable {
    var isDeleted: Bool { deletedAt != nil }

    /// Call after every local edit: stamps the LWW clock and queues the row for push.
    func touch(now: Date = .now) {
        updatedAt = now
        needsSync = true
    }

    /// Soft delete. Never hard-delete synced rows; the deletion has to sync too.
    func softDelete(now: Date = .now) {
        deletedAt = now
        touch(now: now)
    }
}

enum AppLanguage: String, Codable, CaseIterable, Sendable { case en, es }
