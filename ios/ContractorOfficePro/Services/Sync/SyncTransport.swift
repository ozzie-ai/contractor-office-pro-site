import Foundation
import Supabase

/// The server side of sync. Injected so SyncEngine can be tested against an in-memory fake.
protocol SyncTransport: Sendable {
    /// Insert-or-update by id. The server ignores rows older than what it has (LWW trigger).
    func upsert(_ rows: [Row], into table: String) async throws
    /// Update-only, for tables whose rows are created by an RPC (organizations, members).
    func update(_ row: Row, id: UUID, in table: String) async throws
    /// Rows in `table` for `orgID` with server_updated_at > `since`, oldest first.
    func changes(in table: String, orgID: UUID, since: Date, offset: Int, limit: Int) async throws -> [Row]
}

nonisolated struct SupabaseSyncTransport: SyncTransport {
    let client: SupabaseClient

    func upsert(_ rows: [Row], into table: String) async throws {
        try await client.from(table).upsert(rows, onConflict: "id", returning: .minimal).execute()
    }

    func update(_ row: Row, id: UUID, in table: String) async throws {
        try await client.from(table).update(row).eq("id", value: id).execute()
    }

    func changes(in table: String, orgID: UUID, since: Date, offset: Int, limit: Int) async throws -> [Row] {
        try await client.from(table)
            .select()
            .eq("org_id", value: orgID)
            .gt("server_updated_at", value: SyncDate.format(since))
            .order("server_updated_at")
            .order("id")
            .range(from: offset, to: offset + limit - 1)
            .execute()
            .value
    }
}
