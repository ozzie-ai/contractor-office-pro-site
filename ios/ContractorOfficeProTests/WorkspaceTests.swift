import Foundation
import SwiftData
import Testing
@testable import ContractorOfficePro

@Suite("Workspace writes")
struct WorkspaceTests {
    let backend = FakeBackend()
    let context: ModelContext
    let workspace: Workspace
    let orgID = UUID()

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync)
    }

    @Test func newClientIsSavedDirtyAndQueuedForSync() throws {
        var draft = ClientDraft()
        draft.name = "  Ana López "
        draft.email = " Ana@Example.com "
        draft.phone = "   "

        let client = try workspace.save(draft)

        #expect(client.name == "Ana López")
        #expect(client.email == "ana@example.com")
        #expect(client.phone == nil, "blank fields are stored as nil")
        #expect(client.orgId == orgID)
        #expect(client.needsSync)
        #expect(workspace.sync.pendingCount == 1)
    }

    @Test func changingSMSConsentRecordsWhen() throws {
        var draft = ClientDraft()
        draft.name = "Bob"
        let client = try workspace.save(draft)
        #expect(client.smsConsentAt == nil)

        draft.smsConsent = .granted
        try workspace.save(draft, to: client)

        #expect(client.smsConsent == .granted)
        #expect(client.smsConsentAt != nil)
    }

    @Test func newJobIsAssignedToTheOwner() throws {
        var draft = JobDraft()
        draft.title = "Panel upgrade"
        let job = try workspace.save(draft)
        #expect(job.assignedTo == workspace.memberID)
        #expect(job.scheduledStart == nil)
    }

    @Test func statusChangeOnlyTouchesWhenItChanges() throws {
        var draft = JobDraft()
        draft.title = "Deck"
        let job = try workspace.save(draft)
        job.needsSync = false
        let stamp = job.updatedAt

        try workspace.setStatus(.lead, for: job)
        #expect(!job.needsSync && job.updatedAt == stamp)

        try workspace.setStatus(.scheduled, for: job)
        #expect(job.needsSync && job.status == .scheduled)
    }

    @Test func deleteIsSoftAndSyncs() throws {
        var draft = ClientDraft()
        draft.name = "Gone"
        let client = try workspace.save(draft)
        client.needsSync = false

        try workspace.delete(client)

        #expect(client.deletedAt != nil)
        #expect(client.needsSync)
        #expect(try context.fetchCount(FetchDescriptor<Client>()) == 1, "row kept for sync")
    }

    @Test func savedWorkReachesTheServer() async throws {
        var draft = ClientDraft()
        draft.name = "Ana"
        let client = try workspace.save(draft)

        await workspace.sync.syncNow()

        #expect(await backend.row(in: "clients", id: client.id)?.string("name") == "Ana")
    }
}

@Suite("Editor drafts")
struct DraftTests {
    @Test(arguments: ["", "   "]) func clientNeedsAName(name: String) {
        var draft = ClientDraft()
        draft.name = name
        #expect(!draft.isValid)
    }

    @Test(arguments: [("ana@example.com", true), ("", true), ("ana@", false), ("ana example.com", false)])
    func clientEmailValidation(email: String, valid: Bool) {
        var draft = ClientDraft()
        draft.name = "Ana"
        draft.email = email
        #expect(draft.isValid == valid)
    }

    @Test func jobScheduleMustEndAfterStart() {
        var draft = JobDraft()
        draft.title = "Deck"
        draft.hasSchedule = true
        draft.end = draft.start.addingTimeInterval(-60)
        #expect(!draft.isValid)
        draft.hasSchedule = false
        #expect(draft.isValid, "dates are ignored when there's no schedule")
    }

    @Test(arguments: [("7.25", "0.0725"), ("7,25", "0.0725"), ("10%", "0.1"), ("", "0"), ("0", "0")])
    func taxPercentParses(text: String, fraction: String) {
        var draft = OrganizationDraft(Organization(name: "Flores"))
        draft.taxPercentText = text
        #expect(draft.taxRate == Decimal(string: fraction))
    }

    @Test(arguments: ["abc", "-1", "30"]) func taxRejectsNonsense(text: String) {
        var draft = OrganizationDraft(Organization(name: "Flores"))
        draft.taxPercentText = text
        #expect(draft.taxRate == nil)
        #expect(!draft.isValid)
    }

    @Test func taxShowsAsPercentWhenEditing() {
        let org = Organization(name: "Flores", taxRate: Decimal(string: "0.0725")!)
        #expect(OrganizationDraft(org).taxPercentText == (Decimal(string: "7.25")!).formatted(.number.grouping(.never)))
    }
}

@Suite("Job list grouping")
struct JobSectionTests {
    @Test func groupsByStatusInWorkOrderAndHidesEmptySections() {
        let org = UUID()
        let lead = Job(orgId: org, title: "Lead", assignedTo: nil)
        let active = Job(orgId: org, title: "Active", assignedTo: nil); active.status = .inProgress
        let done = Job(orgId: org, title: "Done", assignedTo: nil); done.status = .completed
        let deleted = Job(orgId: org, title: "Deleted", assignedTo: nil); deleted.softDelete()

        let sections = JobSection.make(from: [lead, active, done, deleted], filter: .active)

        #expect(sections.map(\.status) == [.inProgress, .lead])
        #expect(sections.flatMap(\.jobs).map(\.title) == ["Active", "Lead"])
        #expect(JobSection.make(from: [lead, active, done], filter: .done).map(\.status) == [.completed])
    }

    @Test func scheduledJobsSortBySoonestFirst() {
        let org = UUID()
        let later = Job(orgId: org, title: "Later", assignedTo: nil)
        later.status = .scheduled; later.scheduledStart = .now.addingTimeInterval(86_400 * 3)
        let sooner = Job(orgId: org, title: "Sooner", assignedTo: nil)
        sooner.status = .scheduled; sooner.scheduledStart = .now.addingTimeInterval(86_400)

        let jobs = JobSection.make(from: [later, sooner], filter: .active).first?.jobs.map(\.title)
        #expect(jobs == ["Sooner", "Later"])
    }
}
