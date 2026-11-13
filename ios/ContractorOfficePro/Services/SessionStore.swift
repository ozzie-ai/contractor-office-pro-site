import Foundation
import Observation
import Supabase
import SwiftData

/// Sign-in state and first-run org setup.
/// Flow: email → 6-digit code → (first time) business name → ready.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case backendMissing
        case signedOut
        /// First launch with no connection: anonymous sign-in needs the network once.
        case offline
        case needsOrganization(userId: UUID, email: String?)
        case ready(orgId: UUID, memberId: UUID)
    }

    /// User-facing errors are String Catalog keys, never raw server text.
    enum Failure: String, Error {
        case invalidEmail = "auth.error.invalid_email"
        case invalidCode = "auth.error.invalid_code"
        case network = "auth.error.network"
        case orgSetup = "auth.error.org_setup"
    }

    private(set) var state: State = .loading
    private let client: SupabaseClient?
    private let context: ModelContext

    init(client: SupabaseClient? = Backend.client, context: ModelContext) {
        self.client = client
        self.context = context
    }

    func start() async {
        guard let client else { state = .backendMissing; return }
        if let session = try? await client.auth.session {
            await resolve(user: session.user)
            return
        }
        // Dev mode (ADR 0004): no login screen. Sign in anonymously; an email can be linked to this
        // same account later without losing data. The email-code flow below stays for that.
        do {
            let session = try await client.auth.signInAnonymously()
            await resolve(user: session.user)
        } catch {
            state = .offline
        }
    }

    func sendCode(to rawEmail: String) async throws(Failure) {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.contains("@"), email.contains(".") else { throw .invalidEmail }
        do {
            try await client?.auth.signInWithOTP(email: email, shouldCreateUser: true)
        } catch {
            throw .network
        }
    }

    func verify(email rawEmail: String, code: String) async throws(Failure) {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let token = code.filter(\.isNumber)
        guard token.count == 6, let client else { throw .invalidCode }
        do {
            let response = try await client.auth.verifyOTP(email: email, token: token, type: .email)
            await resolve(user: response.user)
        } catch {
            throw .invalidCode
        }
    }

    /// First sign-in: create the org and owner locally (device-generated ids), then register them on the server.
    func createOrganization(name: String, ownerName: String, language: AppLanguage) async throws(Failure) {
        guard case .needsOrganization(let userId, _) = state, let client else { throw .orgSetup }
        let org = Organization(name: name.trimmingCharacters(in: .whitespaces), defaultLanguage: language)
        let owner = Member(orgId: org.id, userId: userId, displayName: ownerName.trimmingCharacters(in: .whitespaces),
                           role: .owner, preferredLanguage: language)
        do {
            let serverOrgId: UUID = try await client.rpc("create_org_for_user", params: CreateOrgParams(
                p_org_id: org.id, p_member_id: owner.id, p_org_name: org.name,
                p_display_name: owner.displayName, p_language: language.rawValue
            )).execute().value

            if serverOrgId == org.id {
                org.needsSync = false
                owner.needsSync = false
                context.insert(org)
                context.insert(owner)
                try context.save()
                state = .ready(orgId: org.id, memberId: owner.id)
            } else {
                // This account already has a business (e.g. new phone). Use the server's copy.
                try await downloadOrganization(for: userId)
            }
        } catch {
            throw .orgSetup
        }
    }

    func signOut() async {
        try? await client?.auth.signOut()
        state = .signedOut
    }

    // MARK: - Private

    private func resolve(user: User) async {
        let uid = user.id
        if let member = localMember(for: uid) {
            state = .ready(orgId: member.orgId, memberId: member.id)
            return
        }
        do {
            try await downloadOrganization(for: uid)
        } catch {
            state = .needsOrganization(userId: uid, email: user.email)
        }
    }

    private func localMember(for userId: UUID) -> Member? {
        let descriptor = FetchDescriptor<Member>(predicate: #Predicate { $0.userId == userId && $0.deletedAt == nil })
        return try? context.fetch(descriptor).first
    }

    /// Pulls this user's org + member rows (RLS limits results to orgs they belong to).
    private func downloadOrganization(for userId: UUID) async throws {
        guard let client else { throw Failure.orgSetup }
        let members: [MemberDTO] = try await client.from("members")
            .select().eq("user_id", value: userId).is("deleted_at", value: nil)
            .limit(1).execute().value
        guard let memberDTO = members.first else { throw Failure.orgSetup }
        let orgDTO: OrganizationDTO = try await client.from("organizations")
            .select().eq("id", value: memberDTO.orgId).single().execute().value

        upsert(orgDTO)
        upsert(memberDTO)
        try context.save()
        state = .ready(orgId: memberDTO.orgId, memberId: memberDTO.id)
    }

    private func upsert(_ dto: OrganizationDTO) {
        let id = dto.id
        if let existing = try? context.fetch(FetchDescriptor<Organization>(predicate: #Predicate { $0.id == id })).first {
            existing.apply(dto)
        } else {
            context.insert(Organization(dto))
        }
    }

    private func upsert(_ dto: MemberDTO) {
        let id = dto.id
        if let existing = try? context.fetch(FetchDescriptor<Member>(predicate: #Predicate { $0.id == id })).first {
            existing.apply(dto)
        } else {
            context.insert(Member(dto))
        }
    }
}

private struct CreateOrgParams: Encodable, Sendable {
    let p_org_id: UUID
    let p_member_id: UUID
    let p_org_name: String
    let p_display_name: String
    let p_language: String
}
