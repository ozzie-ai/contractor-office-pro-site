import Foundation
import Observation
import SwiftData

/// Account + business state for the app (MV pattern: views read it from the environment).
/// Dev mode (ADR 0004): signs in anonymously, no login screen. The email-code methods stay for later.
@Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case backendMissing
        case signedOut
        /// First launch with no connection: anonymous sign-in needs the network once.
        case offline
        case needsOrganization(userID: UUID)
        case ready(orgID: UUID, memberID: UUID)
    }

    enum Failure: Error, Equatable {
        case invalidEmail, invalidCode, network, organizationSetup

        @MainActor var message: LocalizedStringResource {
            switch self {
            case .invalidEmail: .authErrorInvalidEmail
            case .invalidCode: .authErrorInvalidCode
            case .network: .authErrorNetwork
            case .organizationSetup: .authErrorOrgSetup
            }
        }
    }

    private(set) var state: State = .loading {
        didSet { makeSyncEngineIfReady(previous: oldValue) }
    }
    /// Exists once the business is known; HomeView runs it with `.task`.
    private(set) var sync: SyncEngine?

    private let account: (any AccountClient)?
    private let transport: (any SyncTransport)?
    private let context: ModelContext
    private let defaults: UserDefaults

    init(account: (any AccountClient)?, transport: (any SyncTransport)?, context: ModelContext,
         defaults: UserDefaults = .standard) {
        self.account = account
        self.transport = transport
        self.context = context
        self.defaults = defaults
    }

    static func live(context: ModelContext) -> SessionStore {
        SessionStore(account: Backend.client.map(SupabaseAccountClient.init),
                     transport: Backend.client.map(SupabaseSyncTransport.init),
                     context: context)
    }

    func start() async {
        guard let account else { state = .backendMissing; return }
        if let userID = await account.currentUserID() {
            await resolve(userID: userID)
            return
        }
        do {
            await resolve(userID: try await account.signInAnonymously())
        } catch {
            state = .offline
        }
    }

    func sendCode(to rawEmail: String) async throws(Failure) {
        let email = Self.normalize(rawEmail)
        guard email.contains("@"), email.contains("."), let account else { throw .invalidEmail }
        do { try await account.sendCode(to: email) } catch { throw .network }
    }

    func verify(email rawEmail: String, code: String) async throws(Failure) {
        let token = code.filter(\.isNumber)
        guard token.count == 6, let account else { throw .invalidCode }
        do {
            await resolve(userID: try await account.verify(email: Self.normalize(rawEmail), code: token))
        } catch {
            throw .invalidCode
        }
    }

    /// First run: register the business with device-generated ids, then mirror it locally.
    func createOrganization(name: String, ownerName: String, language: AppLanguage) async throws(Failure) {
        guard case .needsOrganization(let userID) = state, let account else { throw .organizationSetup }
        let request = NewOrganization(name: name.trimmingCharacters(in: .whitespaces),
                                      ownerName: ownerName.trimmingCharacters(in: .whitespaces),
                                      language: language)
        do {
            let serverOrgID = try await account.createOrganization(request)
            if serverOrgID == request.orgID {
                let org = Organization(id: request.orgID, name: request.name, defaultLanguage: language)
                let owner = Member(id: request.memberID, orgId: request.orgID, userId: userID,
                                   displayName: request.ownerName, role: .owner, preferredLanguage: language)
                org.needsSync = false
                owner.needsSync = false
                context.insert(org)
                context.insert(owner)
                try context.save()
                state = .ready(orgID: org.id, memberID: owner.id)
            } else if try await !downloadMembership(for: userID) {
                throw Failure.organizationSetup
            }
        } catch {
            throw .organizationSetup
        }
    }

    func signOut() async {
        await account?.signOut()
        state = .signedOut
    }

    // MARK: - Private

    private func resolve(userID: UUID) async {
        if let member = localMember(for: userID) {
            state = .ready(orgID: member.orgId, memberID: member.id)
        } else if (try? await downloadMembership(for: userID)) == true {
            return
        } else {
            state = .needsOrganization(userID: userID)
        }
    }

    private func localMember(for userID: UUID) -> Member? {
        let descriptor = FetchDescriptor<Member>(predicate: #Predicate { $0.userId == userID && $0.deletedAt == nil })
        return try? context.fetch(descriptor).first
    }

    /// An existing account on a new device: pull its business and owner row.
    private func downloadMembership(for userID: UUID) async throws -> Bool {
        guard let membership = try await account?.membership(for: userID),
              let org = upsertLocal(membership.organization, as: Organization.self),
              let member = upsertLocal(membership.member, as: Member.self) else { return false }
        try context.save()
        state = .ready(orgID: org.id, memberID: member.id)
        return true
    }

    private func upsertLocal<T: SyncRecord>(_ row: Row, as type: T.Type) -> T? {
        guard let id = row.uuid("id") else { return nil }
        if let existing = try? context.fetch(FetchDescriptor<T>()).first(where: { $0.id == id }) {
            existing.apply(row)
            return existing
        }
        guard let created = T.make(row) else { return nil }
        context.insert(created)
        return created
    }

    private func makeSyncEngineIfReady(previous: State) {
        guard state != previous else { return }
        guard case .ready(let orgID, _) = state, let transport else { sync = nil; return }
        sync = SyncEngine(transport: transport, context: context, orgID: orgID, defaults: defaults)
    }

    private static func normalize(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}
