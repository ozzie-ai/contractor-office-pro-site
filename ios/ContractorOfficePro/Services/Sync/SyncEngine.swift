import Foundation
import Network
import Observation
import SwiftData

/// Offline-first sync with last-write-wins (docs/decisions/0001-offline-sync-lww.md).
/// Push: dirty rows, parents first. Pull: rows changed on the server since the per-table cursor.
/// Lifecycle: HomeView calls `run()` from `.task`, so monitoring stops when the view goes away.
@Observable
final class SyncEngine {
    enum Status: Equatable { case idle, syncing, offline, failed }

    private(set) var status: Status = .idle
    private(set) var lastSyncedAt: Date?
    private(set) var pendingCount = 0

    private let transport: any SyncTransport
    private let context: ModelContext
    private let orgId: UUID
    private let defaults: UserDefaults
    private var running = false
    private var again = false
    private var debounce: Task<Void, Never>?

    /// Push order respects foreign keys.
    private static let order: [any SyncRecord.Type] = [
        Organization.self, Member.self, Client.self, Job.self, TimeEntry.self, PriceBookItem.self,
        Estimate.self, LineItem.self, Receipt.self, ReceiptLineItem.self, Expense.self, Media.self,
    ]
    private static let pageSize = 500
    /// Re-read a few seconds before the cursor so a slow concurrent write isn't skipped. Applying is idempotent.
    private static let overlap: TimeInterval = 5

    init(transport: any SyncTransport, context: ModelContext, orgID: UUID, defaults: UserDefaults = .standard) {
        self.transport = transport
        self.context = context
        self.orgId = orgID
        self.defaults = defaults
        lastSyncedAt = defaults.object(forKey: key("lastSyncedAt")) as? Date
    }

    /// Syncs whenever the network becomes available (the monitor reports the current path first).
    func run() async {
        for await path in NWPathMonitor() {
            if path.status == .satisfied {
                await syncNow()
            } else {
                status = .offline
            }
        }
    }

    /// Call after local saves. Coalesces bursts of edits into one sync.
    func syncSoon(after delay: TimeInterval = 3) {
        refreshPendingCount()
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.syncNow()
        }
    }

    func syncNow() async {
        if running { again = true; return }
        running = true
        status = .syncing
        defer { running = false }
        repeat {
            again = false
            do {
                for type in Self.order { try await push(type) }
                for type in Self.order { try await pull(type) }
                try context.save()
                lastSyncedAt = .now
                defaults.set(lastSyncedAt, forKey: key("lastSyncedAt"))
                status = .idle
            } catch {
                status = (error as? URLError) != nil ? .offline : .failed
                again = false
            }
        } while again
        refreshPendingCount()
    }

    // MARK: - Push

    private func push<T: SyncRecord>(_ type: T.Type) async throws {
        let dirty = try context.fetch(FetchDescriptor<T>()).filter { $0.needsSync && $0.orgId == orgId }
        guard !dirty.isEmpty else { return }
        // Remember each row's timestamp: if it's edited again mid-push, it stays dirty.
        let snapshot = dirty.map { (record: $0, stamp: $0.updatedAt, row: $0.row()) }

        if T.pushesWithUpdateOnly {
            for item in snapshot {
                var row = item.row
                for k in ["id", "org_id", "created_at", "user_id", "role"] { row[k] = nil }
                try await transport.update(row, id: item.record.id, in: T.table)
            }
        } else {
            for start in stride(from: 0, to: snapshot.count, by: Self.pageSize) {
                let chunk = snapshot[start..<min(start + Self.pageSize, snapshot.count)].map(\.row)
                try await transport.upsert(Array(chunk), into: T.table)
            }
        }
        for item in snapshot where item.record.updatedAt == item.stamp {
            item.record.needsSync = false
        }
        try context.save()
    }

    // MARK: - Pull

    private func pull<T: SyncRecord>(_ type: T.Type) async throws {
        let cursorKey = key("cursor.\(T.table)")
        let cursor = (defaults.string(forKey: cursorKey)).flatMap(SyncDate.parse) ?? .distantPast
        let since = cursor == .distantPast ? Date(timeIntervalSince1970: 0)
                                           : cursor.addingTimeInterval(-Self.overlap)
        var local = Dictionary(uniqueKeysWithValues:
            try context.fetch(FetchDescriptor<T>()).map { ($0.id, $0) })
        var newest = cursor
        var offset = 0

        while true {
            let rows = try await transport.changes(in: T.table, orgID: orgId, since: since,
                                                   offset: offset, limit: Self.pageSize)

            for r in rows {
                guard let id = r.uuid("id") else { continue }
                if let server = r.date("server_updated_at"), server > newest { newest = server }
                if let existing = local[id] {
                    let remoteStamp = r.date("updated_at") ?? .distantPast
                    if SyncRules.shouldApplyRemote(localDirty: existing.needsSync,
                                                   localUpdatedAt: existing.updatedAt,
                                                   remoteUpdatedAt: remoteStamp) {
                        existing.apply(r)
                    }
                } else if let created = T.make(r) {
                    context.insert(created)
                    local[id] = created
                }
            }
            if rows.count < Self.pageSize { break }
            offset += Self.pageSize
        }
        try context.save()
        if newest > cursor { defaults.set(SyncDate.format(newest), forKey: cursorKey) }
    }

    // MARK: - Helpers

    private func refreshPendingCount() {
        var count = 0
        for type in Self.order { count += dirtyCount(type) }
        pendingCount = count
    }

    private func dirtyCount<T: SyncRecord>(_ type: T.Type) -> Int {
        ((try? context.fetch(FetchDescriptor<T>())) ?? []).filter { $0.needsSync && $0.orgId == orgId }.count
    }

    private func key(_ suffix: String) -> String { "sync.\(orgId.uuidString).\(suffix)" }
}
