import Foundation
import Observation
import SwiftData

/// The signed-in business: every local write goes through here so it is stamped, saved and synced the same way.
@Observable
final class Workspace {
    let orgID: UUID
    let memberID: UUID
    let sync: SyncEngine
    /// AI + pricing backend; nil when BACKEND_URL isn't configured.
    let estimateService: (any EstimateService)?
    private let context: ModelContext

    init(orgID: UUID, memberID: UUID, context: ModelContext, sync: SyncEngine,
         estimateService: (any EstimateService)? = nil) {
        self.orgID = orgID
        self.memberID = memberID
        self.context = context
        self.sync = sync
        self.estimateService = estimateService
    }

    var organization: Organization? {
        let id = orgID
        return try? context.fetch(FetchDescriptor<Organization>(predicate: #Predicate { $0.id == id })).first
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

    /// Turns an AI draft into a local draft estimate. The contractor reviews everything before it goes anywhere.
    @discardableResult
    func createEstimate(for job: Job, notes: String, language: AppLanguage, draft: EstimateDraft) throws -> Estimate {
        let estimate = insert(Estimate(orgId: orgID, jobId: job.id, language: language))
        estimate.internalNotes = notes.nilIfBlank
        let i = draft.interpretation
        estimate.exclusions = (i.excludedWork + i.futureWork).joined(separator: "\n").nilIfBlank
        estimate.openQuestions = OpenQuestion.encode(i.openQuestions)
        let lines = draft.pricing.lines.enumerated().map { index, priced in
            makeLine(from: priced, in: estimate, position: index)
        }
        if job.status == .lead { job.status = .estimating; job.touch() }
        recalculate(estimate, lines: lines)
        try context.save()
        sync.syncSoon()
        return estimate
    }

    /// Applies the contractor-approved subset of a refinement: new lines, quantity updates, exclusions,
    /// the remaining questions, and the Q&A appended to the private notes.
    func apply(_ proposal: RefinementProposal, to estimate: Estimate, lines: [LineItem],
               addIndexes: Set<Int>, updateIndexes: Set<Int>) throws {
        var position = (lines.map(\.position).max() ?? -1) + 1
        for (index, priced) in proposal.adds.enumerated() where addIndexes.contains(index) {
            _ = makeLine(from: priced, in: estimate, position: position)
            position += 1
        }
        for (index, update) in proposal.updates.enumerated() where updateIndexes.contains(index) && lines.indices.contains(update.ref) {
            let line = lines[update.ref]
            if let quantity = update.quantity { line.qty = Decimal(string: String(quantity)) ?? Decimal(quantity) }
            if let unit = update.unit?.nilIfBlank { line.unit = unit }
            line.touch()
        }
        let existing = Set((estimate.exclusions ?? "").split(separator: "\n").map(String.init))
        let newExclusions = proposal.exclusions.filter { !existing.contains($0) }
        estimate.exclusions = ((estimate.exclusions.map { [$0] } ?? []) + newExclusions).joined(separator: "\n").nilIfBlank
        estimate.openQuestions = OpenQuestion.encode(proposal.remainingQuestions)
        let qa = proposal.answers.map { "Q: \($0.question)\nA: \($0.answer)" }.joined(separator: "\n")
        estimate.internalNotes = [estimate.internalNotes, qa].compactMap { $0?.nilIfBlank }.joined(separator: "\n\n")
        recalculate(estimate, lines: self.lines(for: estimate))
        try context.save()
        sync.syncSoon()
    }

    private func makeLine(from priced: PricedLineDTO, in estimate: Estimate, position: Int) -> LineItem {
        let line = insert(LineItem(orgId: orgID, estimateId: estimate.id, position: position,
                                   descriptionEn: priced.descriptionEn, descriptionEs: priced.descriptionEs,
                                   qty: priced.quantity?.value ?? 0, unit: priced.unit ?? "ea",
                                   unitPrice: priced.unitPrice?.value ?? 0, source: .ai))
        line.taskCode = priced.taskCode
        line.priceSource = LineItem.PriceSource(rawValue: priced.priceSource) ?? .none
        line.preliminary = priced.preliminary
        // The AI ballpark note already starts with its source name; don't repeat it.
        let source = priced.note.map { note in priced.sourceName.map { note.hasPrefix($0) } ?? false } == true ? nil : priced.sourceName
        line.priceNote = [source, priced.appliesTo, priced.note].compactMap { $0?.nilIfBlank }
            .joined(separator: " · ").nilIfBlank
        return line
    }

    // MARK: Materials

    func materials(for estimate: Estimate) -> [MaterialItem] {
        let id = estimate.id
        let descriptor = FetchDescriptor<MaterialItem>(predicate: #Predicate { $0.estimateId == id && $0.deletedAt == nil },
                                                       sortBy: [SortDescriptor(\.position)])
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Replaces the AI draft list. Items already marked purchased (and manual additions) are kept.
    func replaceMaterials(of estimate: Estimate, with list: MaterialsListDTO) throws {
        let existing = materials(for: estimate)
        let kept = existing.filter { $0.purchased || $0.evidence == .manual }
        for item in existing where !kept.contains(where: { $0.id == item.id }) { item.softDelete() }
        let keptNames = Set(kept.map { $0.nameEn.lowercased() })
        var position = (kept.map(\.position).max() ?? -1) + 1
        for material in list.materials where !keptNames.contains(material.nameEn.lowercased()) {
            let item = insert(MaterialItem(orgId: orgID, estimateId: estimate.id, position: position,
                                           nameEn: material.nameEn, nameEs: material.nameEs, category: material.category,
                                           qty: material.quantity.flatMap { Decimal(string: String($0)) } ?? 0,
                                           unit: material.unit ?? "each", searchQuery: material.searchQuery,
                                           evidence: material.evidence == "stated" ? .stated : .inferred))
            item.specifications = material.specifications.joined(separator: "\n").nilIfBlank
            item.note = material.noteEn.nilIfBlank
            position += 1
        }
        try context.save()
        sync.syncSoon()
    }

    func togglePurchased(_ item: MaterialItem) throws {
        item.purchased.toggle()
        try commit(item)
    }

    @discardableResult
    func save(_ draft: MaterialDraft, to item: MaterialItem?, in estimate: Estimate) throws -> MaterialItem {
        let item = item ?? insert(MaterialItem(orgId: orgID, estimateId: estimate.id,
                                               position: (materials(for: estimate).map(\.position).max() ?? -1) + 1,
                                               nameEn: draft.nameEn.trimmed))
        draft.apply(to: item)
        try commit(item)
        return item
    }

    func delete(_ item: MaterialItem) throws {
        item.softDelete()
        try commit(item, touch: false)
    }

    /// One-step job creation for the guided flow: optional new client, a job named after the trade, then the AI draft.
    @discardableResult
    func createQuickEstimate(trade: Trade, client existing: Client?, newClientName: String?, newClientPhone: String?,
                             notes: String, language: AppLanguage, photos: [Data] = [],
                             draft: EstimateDraft) throws -> Estimate {
        var client = existing
        if client == nil, let name = newClientName?.nilIfBlank {
            var clientDraft = ClientDraft()
            clientDraft.name = name
            clientDraft.phone = newClientPhone ?? ""
            clientDraft.preferredLanguage = language
            client = try save(clientDraft)
        }
        var jobDraft = JobDraft(clientID: client?.id, address: client?.address)
        let tradeName = String(localized: trade.title)
        jobDraft.title = client.map { "\(tradeName) · \($0.name)" } ?? tradeName
        jobDraft.status = .estimating
        let job = try save(jobDraft)
        for photo in photos { try addPhoto(photo, to: job) }
        return try createEstimate(for: job, notes: notes, language: language, draft: draft)
    }

    func markSent(_ estimate: Estimate, language: AppLanguage, now: Date = .now) throws {
        estimate.status = .sent
        estimate.sentAt = now
        estimate.language = language
        try commit(estimate)
    }

    @discardableResult
    func createBlankEstimate(for job: Job) throws -> Estimate {
        let estimate = insert(Estimate(orgId: orgID, jobId: job.id, language: organization?.defaultLanguage ?? .en))
        try commit(estimate)
        return estimate
    }

    func lines(for estimate: Estimate) -> [LineItem] {
        let id = estimate.id
        let descriptor = FetchDescriptor<LineItem>(predicate: #Predicate { $0.estimateId == id && $0.deletedAt == nil },
                                                   sortBy: [SortDescriptor(\.position)])
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Saves a line (new when `line` is nil). Optionally remembers the price in the price book for its task.
    @discardableResult
    func save(_ draft: LineDraft, to line: LineItem?, in estimate: Estimate, rememberPrice: Bool = false) throws -> LineItem {
        let line = line ?? insert(LineItem(orgId: orgID, estimateId: estimate.id,
                                           position: (lines(for: estimate).map(\.position).max() ?? -1) + 1))
        draft.apply(to: line)
        if rememberPrice, let code = line.taskCode {
            rememberPriceInBook(taskCode: code, unitPrice: line.unitPrice, unit: line.unit, name: line.descriptionEn)
            line.priceSource = .contractor
            line.preliminary = false
            line.priceNote = String(localized: .estimatePriceFromBook)
        }
        line.touch()
        recalculate(estimate, lines: lines(for: estimate))
        try context.save()
        sync.syncSoon()
        return line
    }

    /// One tap "this price looks right" on an AI ballpark line. Remembered in the price book when it has a task code.
    func confirmPrice(of line: LineItem, in estimate: Estimate) throws {
        line.preliminary = false
        if let code = line.taskCode {
            rememberPriceInBook(taskCode: code, unitPrice: line.unitPrice, unit: line.unit, name: line.descriptionEn)
            line.priceSource = .contractor
            line.priceNote = String(localized: .estimatePriceFromBook)
        } else {
            line.priceSource = .manual
            line.priceNote = nil
        }
        line.touch()
        recalculate(estimate, lines: lines(for: estimate))
        try context.save()
        sync.syncSoon()
    }

    // MARK: Photos (kept on the phone; never on customer documents)

    func photos(for job: Job) -> [Media] {
        let id = job.id
        let photo = Media.Kind.photo.rawValue
        let descriptor = FetchDescriptor<Media>(
            predicate: #Predicate { $0.jobId == id && $0.kindRaw == photo && $0.deletedAt == nil },
            sortBy: [SortDescriptor(\.capturedAt)])
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Saves already-downscaled JPEG data (PhotoStore.prepare) as a job photo.
    @discardableResult
    func addPhoto(_ jpeg: Data, to job: Job, store: PhotoStore = .shared) throws -> Media {
        let name = try store.save(jpeg)
        let media = insert(Media(orgId: orgID, jobId: job.id, kind: .photo, localFileName: name))
        try commit(media)
        return media
    }

    func delete(_ photo: Media, store: PhotoStore = .shared) throws {
        if let name = photo.localFileName { store.remove(name) }
        photo.softDelete()
        try commit(photo, touch: false)
    }

    func delete(_ line: LineItem, from estimate: Estimate) throws {
        line.softDelete()
        recalculate(estimate, lines: lines(for: estimate))
        try context.save()
        sync.syncSoon()
    }

    func delete(_ estimate: Estimate) throws {
        for line in lines(for: estimate) { line.softDelete() }
        estimate.softDelete()
        try context.save()
        sync.syncSoon()
    }

    private func recalculate(_ estimate: Estimate, lines: [LineItem]) {
        EstimateCalculator.apply(to: estimate, lineItems: lines, taxRate: organization?.taxRate ?? 0)
    }

    private func rememberPriceInBook(taskCode: String, unitPrice: Decimal, unit: String, name: String) {
        let org = orgID
        let existing = try? context.fetch(FetchDescriptor<PriceBookItem>(
            predicate: #Predicate { $0.orgId == org && $0.taskCode == taskCode && $0.deletedAt == nil })).first
        let item = existing ?? insert(PriceBookItem(orgId: orgID, kind: .other, nameEn: name, unit: unit))
        item.taskCode = taskCode
        item.unitPrice = unitPrice
        item.unit = unit
        item.touch()
    }

    // MARK: Truck stock (leftovers)

    func stock() -> [StockItem] {
        let org = orgID
        let descriptor = FetchDescriptor<StockItem>(predicate: #Predicate { $0.orgId == org && $0.deletedAt == nil },
                                                    sortBy: [SortDescriptor(\.nameEn)])
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Saves what's left after a job. `amounts` maps material id → quantity left (in the material's unit).
    /// Matching items already on the truck are topped up instead of duplicated. Returns how many items were saved.
    @discardableResult
    func saveLeftovers(_ amounts: [UUID: Decimal], from items: [MaterialItem], estimate: Estimate) throws -> Int {
        var onTruck = stock()
        var saved = 0
        for item in items {
            guard let amount = amounts[item.id], amount > 0 else { continue }
            if let existing = onTruck.first(where: { StockMatcher.isSame(item.nameEn, item.unit, as: $0) }) {
                existing.qty += amount
                existing.sourceEstimateId = estimate.id
                existing.touch()
            } else {
                let stock = insert(StockItem(orgId: orgID, nameEn: item.nameEn, nameEs: item.nameEs, category: item.category,
                                             qty: amount, unit: item.unit, searchQuery: item.searchQuery))
                stock.specifications = item.specifications
                stock.sourceEstimateId = estimate.id
                onTruck.append(stock)
            }
            saved += 1
        }
        try context.save()
        sync.syncSoon()
        return saved
    }

    /// Takes a material from the truck instead of buying it: marks it bought and subtracts what it needs.
    func use(_ stock: StockItem, for material: MaterialItem) throws {
        let needed = material.qty > 0 ? material.qty : stock.qty
        stock.qty = max(0, stock.qty - needed)
        if stock.qty == 0 { stock.softDelete() } else { stock.touch() }
        if !material.purchased {
            material.purchased = true
            material.note = [material.note, String(localized: .truckUsedFromTruck)].compactMap { $0?.nilIfBlank }.joined(separator: " · ")
            material.touch()
        }
        try context.save()
        sync.syncSoon()
    }

    @discardableResult
    func save(_ draft: StockDraft, to item: StockItem?) throws -> StockItem {
        let item = item ?? insert(StockItem(orgId: orgID, nameEn: draft.nameEn.trimmed))
        draft.apply(to: item)
        try commit(item)
        return item
    }

    func delete(_ item: StockItem) throws {
        item.softDelete()
        try commit(item, touch: false)
    }

    // MARK: Tools

    func tools() -> [Tool] {
        let org = orgID
        return (try? context.fetch(FetchDescriptor<Tool>(predicate: #Predicate { $0.orgId == org && $0.deletedAt == nil },
                                                         sortBy: [SortDescriptor(\.nameEn)]))) ?? []
    }

    /// Adds tools the contractor approved from the AI's list. Each photo is stored once and shared by its tools;
    /// a quantity of 3 adds three tools (each can be lent out separately).
    @discardableResult
    func addTools(_ picks: [ToolPick], photos: [Data], store: PhotoStore = .shared) throws -> [Tool] {
        var savedPhotos: [Int: String] = [:]
        var added: [Tool] = []
        for pick in picks {
            if savedPhotos[pick.photoIndex] == nil, photos.indices.contains(pick.photoIndex) {
                savedPhotos[pick.photoIndex] = try store.save(photos[pick.photoIndex])
            }
            for _ in 0..<min(max(pick.quantity, 1), 50) {
                let tool = insert(Tool(orgId: orgID, nameEn: pick.nameEn.trimmed, nameEs: pick.nameEs.trimmed, category: pick.category))
                tool.brand = pick.brand?.nilIfBlank
                tool.model = pick.model?.nilIfBlank
                tool.serialNumber = pick.serialNumber?.nilIfBlank
                tool.photoFileName = savedPhotos[pick.photoIndex]
                added.append(tool)
            }
        }
        try context.save()
        sync.syncSoon()
        return added
    }

    @discardableResult
    func save(_ draft: ToolDraft, to tool: Tool?, photo: Data? = nil, store: PhotoStore = .shared) throws -> Tool {
        let tool = tool ?? insert(Tool(orgId: orgID, nameEn: draft.nameEn.trimmed))
        draft.apply(to: tool)
        if let photo {
            let old = tool.photoFileName
            tool.photoFileName = try store.save(photo)
            if let old { removeToolPhotoIfUnused(old, store: store) }
        }
        try commit(tool)
        return tool
    }

    func setHolder(_ holder: String?, for tool: Tool) throws {
        tool.holder = holder?.nilIfBlank
        try commit(tool)
    }

    func delete(_ tool: Tool, store: PhotoStore = .shared) throws {
        tool.softDelete()
        try commit(tool, touch: false)
        if let name = tool.photoFileName { removeToolPhotoIfUnused(name, store: store) }
    }

    /// People/places tools have been lent to, most used first, for one-tap "who has it".
    func toolHolders() -> [String] {
        let counts = Dictionary(grouping: tools().compactMap(\.holder), by: { $0 }).mapValues(\.count)
        return counts.sorted { ($0.value, $1.key) > ($1.value, $0.key) }.map(\.key)
    }

    private func removeToolPhotoIfUnused(_ name: String, store: PhotoStore) {
        if !tools().contains(where: { $0.photoFileName == name }) { store.remove(name) }
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
