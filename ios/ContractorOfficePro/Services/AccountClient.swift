import Foundation
import Supabase

/// Backend account operations the session needs. Injected so tests and previews never touch the network.
protocol AccountClient: Sendable {
    func currentUserID() async -> UUID?
    func signInAnonymously() async throws -> UUID
    func sendCode(to email: String) async throws
    func verify(email: String, code: String) async throws -> UUID
    /// Returns the org id the server ended up with (an existing one if this user already has a business).
    func createOrganization(_ request: NewOrganization) async throws -> UUID
    func membership(for userID: UUID) async throws -> Membership?
    func signOut() async
}

nonisolated struct NewOrganization: Sendable {
    var orgID = UUID()
    var memberID = UUID()
    var name: String
    var ownerName: String
    var language: AppLanguage
}

nonisolated struct Membership: Sendable {
    let organization: Row
    let member: Row
}

nonisolated struct SupabaseAccountClient: AccountClient {
    let client: SupabaseClient

    func currentUserID() async -> UUID? { try? await client.auth.session.user.id }

    func signInAnonymously() async throws -> UUID {
        try await client.auth.signInAnonymously().user.id
    }

    func sendCode(to email: String) async throws {
        try await client.auth.signInWithOTP(email: email, shouldCreateUser: true)
    }

    func verify(email: String, code: String) async throws -> UUID {
        try await client.auth.verifyOTP(email: email, token: code, type: .email).user.id
    }

    func createOrganization(_ request: NewOrganization) async throws -> UUID {
        try await client.rpc("create_org_for_user", params: CreateOrgParams(
            p_org_id: request.orgID, p_member_id: request.memberID, p_org_name: request.name,
            p_display_name: request.ownerName, p_language: request.language.rawValue
        )).execute().value
    }

    func membership(for userID: UUID) async throws -> Membership? {
        let members: [Row] = try await client.from("members")
            .select().eq("user_id", value: userID).is("deleted_at", value: nil)
            .limit(1).execute().value
        guard let member = members.first, let orgID = member.uuid("org_id") else { return nil }
        let orgs: [Row] = try await client.from("organizations")
            .select().eq("id", value: orgID).limit(1).execute().value
        return orgs.first.map { Membership(organization: $0, member: member) }
    }

    func signOut() async { try? await client.auth.signOut() }
}

private nonisolated struct CreateOrgParams: Encodable, Sendable {
    let p_org_id: UUID
    let p_member_id: UUID
    let p_org_name: String
    let p_display_name: String
    let p_language: String
}
