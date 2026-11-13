import Foundation
import Observation
import SwiftData

/// The signed-in business: every local write goes through here so it is stamped, saved and synced the same way.
@Observable
final class Workspace {
    let orgID: UUID
    let memberID: UUID
    let sync: SyncEngine
    private let context: ModelContext

    init(orgID: UUID, memberID: UUID, context: ModelContext, sync: SyncEngine) {
        self.orgID = orgID
        self.memberID = memberID
        self.context = context
        self.sync = sync
    }

    // MARK: Clients

    @discardableResult
    func save(_ draft: ClientDraft, to client: Client? = nil) throws -> Client {
        let client = client ?? insert(Client(orgId: orgID, name: draft.name.trimmed))
        draft.apply(to: client)
        try commit(client)
        return client
    }

    func delete(_ client: Client) throws {
        client.softDelete()
        try commit(client, touch: false)
    }

    // MARK: Jobs

    @discardableResult
    func save(_ draft: JobDraft, to job: Job? = nil) throws -> Job {
        let job = job ?? insert(Job(orgId: orgID, title: draft.title.trimmed, assignedTo: memberID))
        draft.apply(to: job)
        try commit(job)
        return job
    }

    func setStatus(_ status: Job.Status, for job: Job) throws {
        guard job.status != status else { return }
        job.status = status
        try commit(job)
    }

    func delete(_ job: Job) throws {
        job.softDelete()
        try commit(job, touch: false)
    }

    // MARK: Business

    func save(_ draft: OrganizationDraft, to organization: Organization) throws {
        draft.apply(to: organization)
        try commit(organization)
    }

    // MARK: Private

    private func insert<T: PersistentModel>(_ model: T) -> T {
        context.insert(model)
        return model
    }

    private func commit(_ record: some Syncable, touch: Bool = true) throws {
        if touch { record.touch() }
        try context.save()
        sync.syncSoon()
    }
}

/// Job list grouping, kept out of view bodies so it can be tested.
enum JobFilter: String, CaseIterable, Identifiable {
    case active, done
    var id: Self { self }

    var statuses: [Job.Status] {
        switch self {
        case .active: [.inProgress, .scheduled, .estimating, .lead]
        case .done: [.completed, .cancelled]
        }
    }
}

struct JobSection: Identifiable {
    let status: Job.Status
    let jobs: [Job]
    var id: Job.Status { status }

    static func make(from jobs: [Job], filter: JobFilter) -> [JobSection] {
        filter.statuses.compactMap { status in
            let matching = jobs
                .filter { $0.status == status && $0.deletedAt == nil }
                .sorted { ($0.scheduledStart ?? .distantFuture, $1.updatedAt) < ($1.scheduledStart ?? .distantFuture, $0.updatedAt) }
            return matching.isEmpty ? nil : JobSection(status: status, jobs: matching)
        }
    }
}
