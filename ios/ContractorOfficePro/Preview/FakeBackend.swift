#if DEBUG
import Foundation
import Supabase

/// In-memory stand-in for Supabase: accounts, the org RPC, and sync with the same last-write-wins
/// guard as the real trigger. Used by previews and unit tests so neither touches the network.
actor FakeBackend: AccountClient, SyncTransport {
    private(set) var tables: [String: [UUID: Row]] = [:]
    private var currentUser: UUID?
    private var offline: Bool
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)

    init(signedInUser: UUID? = nil, offline: Bool = false) {
        currentUser = signedInUser
        self.offline = offline
    }

    func setOffline(_ value: Bool) { offline = value }
    func row(in table: String, id: UUID) -> Row? { tables[table]?[id] }
    func count(in table: String) -> Int { tables[table]?.count ?? 0 }

    // MARK: AccountClient

    func currentUserID() async -> UUID? { currentUser }

    func signInAnonymously() async throws -> UUID {
        try checkOnline()
        let user = UUID()
        currentUser = user
        return user
    }

    func sendCode(to email: String) async throws { try checkOnline() }

    func verify(email: String, code: String) async throws -> UUID {
        try checkOnline()
        guard code == "123456" else { throw URLError(.userAuthenticationRequired) }
        return try await signInAnonymously()
    }

    func createOrganization(_ request: NewOrganization) async throws -> UUID {
        try checkOnline()
        guard let user = currentUser else { throw URLError(.userAuthenticationRequired) }
        if let existing = memberRow(for: user)?.uuid("org_id") { return existing }
        let now = J.t(clock)
        write(["id": J.u(request.orgID), "org_id": J.u(request.orgID), "name": J.s(request.name),
               "default_language": J.s(request.language.rawValue), "tax_rate": .integer(0),
               "created_at": now, "updated_at": now, "deleted_at": .null], into: "organizations")
        write(["id": J.u(request.memberID), "org_id": J.u(request.orgID), "user_id": J.u(user),
               "display_name": J.s(request.ownerName), "role": J.s("owner"),
               "preferred_language": J.s(request.language.rawValue),
               "created_at": now, "updated_at": now, "deleted_at": .null], into: "members")
        return request.orgID
    }

    func membership(for userID: UUID) async throws -> Membership? {
        try checkOnline()
        guard let member = memberRow(for: userID), let orgID = member.uuid("org_id"),
              let org = tables["organizations"]?[orgID] else { return nil }
        return Membership(organization: org, member: member)
    }

    func signOut() async { currentUser = nil }

    // MARK: SyncTransport

    func upsert(_ rows: [Row], into table: String) async throws {
        try checkOnline()
        for row in rows { write(row, into: table) }
    }

    func update(_ row: Row, id: UUID, in table: String) async throws {
        try checkOnline()
        guard tables[table]?[id] != nil else { return }
        var row = row
        row["id"] = J.u(id)
        write(row, into: table)
    }

    func changes(in table: String, orgID: UUID, since: Date, offset: Int, limit: Int) async throws -> [Row] {
        try checkOnline()
        let rows = (tables[table] ?? [:]).values
            .filter { $0.uuid("org_id") == orgID && ($0.date("server_updated_at") ?? .distantPast) > since }
            .sorted { ($0.string("server_updated_at") ?? "", $0.string("id") ?? "")
                    < ($1.string("server_updated_at") ?? "", $1.string("id") ?? "") }
        return Array(rows.dropFirst(offset).prefix(limit))
    }

    // MARK: Private

    private func checkOnline() throws {
        if offline { throw URLError(.notConnectedToInternet) }
    }

    private func memberRow(for user: UUID) -> Row? {
        tables["members"]?.values.first { $0.uuid("user_id") == user && $0["deleted_at"] == .null }
    }

    /// Mirrors the server: drop older writes (LWW), merge columns, stamp server_updated_at.
    private func write(_ incoming: Row, into table: String) {
        guard let id = incoming.uuid("id") else { return }
        let existing = tables[table]?[id]
        if let old = existing?.date("updated_at"), let new = incoming.date("updated_at"), new < old { return }
        var merged = existing ?? [:]
        for (key, value) in incoming { merged[key] = value }
        clock = clock.addingTimeInterval(0.001)
        merged["server_updated_at"] = J.t(clock)
        tables[table, default: [:]][id] = merged
    }
}
#endif
