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

    // MARK: Estimates

    enum EstimateSaveError: Error {
        case notApproved, wrongBusiness, roundingMismatch
    }

    /// Saves an explicitly approved preliminary estimate under the existing job.
    /// Only customer-reviewed descriptions, quantities and selling prices persist.
    /// Raw dictation, internal labor, material costs and markups do not become line items.
    @discardableResult
    func saveApprovedEstimate(
        _ result: EstimatingAPIClient.PriceResponse,
        for job: Job,
        approved: Bool
    ) throws -> Estimate {
        guard approved, result.status == "ready_for_contractor_review",
              result.missing.isEmpty, let totalText = result.sellingTotal,
              let expected = Decimal(string: totalText) else {
            throw EstimateSaveError.notApproved
        }
        guard job.orgId == orgID, job.deletedAt == nil else {
            throw EstimateSaveError.wrongBusiness
        }
        let estimate = Estimate(orgId: orgID, jobId: job.id,
                                language: result.customerLanguage == "es" ? .es : .en)
        var lines: [LineItem] = []
        for entry in result.lines {
            guard let quantityText = entry.quantity,
                  let qty = Decimal(string: quantityText), qty > 0,
                  let amountText = entry.sellingTotal,
                  let amount = Decimal(string: amountText) else {
                throw EstimateSaveError.notApproved
            }
            // Supabase line_items.unit_price is numeric(12,2). Never store
            // silent fractional-cent prices that would alter totals on sync.
            let rate = EstimateCalculator.roundCents(amount / qty)
            guard EstimateCalculator.lineTotal(qty: qty, unitPrice: rate) == amount else {
                throw EstimateSaveError.roundingMismatch
            }
            let row = LineItem(orgId: orgID, estimateId: estimate.id, position: lines.count,
                               descriptionEn: entry.descriptionEn,
                               descriptionEs: entry.descriptionEs ?? "",
                               qty: qty, unit: entry.unit, unitPrice: rate,
                               taxable: false,
                               source: entry.source == "contractor_selling_price_override" ? .priceBook : .manual)
            lines.append(row)
        }
        if let tripText = result.mobilizationSellingTotal,
           let trip = Decimal(string: tripText), trip > 0 {
            lines.append(LineItem(orgId: orgID, estimateId: estimate.id, position: lines.count,
                                  descriptionEn: "Mobilization",
                                  descriptionEs: "Movilización",
                                  qty: 1, unit: "job", unitPrice: trip,
                                  taxable: false, source: .manual))
        }
        let computed = EstimateCalculator.totals(
            lines: lines.map { .init(qty: $0.qty, unitPrice: $0.unitPrice, taxable: false) },
            taxRate: 0
        )
        guard computed.total == expected else { throw EstimateSaveError.roundingMismatch }
        estimate.subtotal = computed.subtotal
        estimate.tax = 0
        estimate.total = computed.total
        context.insert(estimate)
        for row in lines { context.insert(row) }
        try context.save()
        sync.syncSoon()
        return estimate
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
