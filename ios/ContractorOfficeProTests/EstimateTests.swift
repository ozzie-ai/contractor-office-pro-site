import Foundation
import SwiftData
import Testing
@testable import ContractorOfficePro

@Suite("AI estimate drafting")
struct EstimateDraftingTests {
    let backend = FakeBackend()
    let context: ModelContext
    let workspace: Workspace
    let job: Job
    let orgID = UUID()

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let org = Organization(id: orgID, name: "Flores")
        context.insert(org)
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync, estimateService: backend)
        job = Job(orgId: orgID, title: "Panel upgrade", assignedTo: nil)
        context.insert(job)
    }

    private func draftEstimate(notes: String = "Cambiar panel de 100 a 200 amperios…") async throws -> Estimate {
        var phases: [EstimateDrafting.Phase] = []
        let draft = try await EstimateDrafting.draft(notes: notes, language: .es, service: backend) { phases.append($0) }
        #expect(phases == [.reading, .pricing])
        return try workspace.createEstimate(for: job, notes: notes, language: .es, draft: draft)
    }

    @Test func draftBecomesAnEditableEstimateWithSourcesOnEveryLine() async throws {
        let estimate = try await draftEstimate()
        let lines = workspace.lines(for: estimate)

        #expect(lines.count == 5)
        #expect(lines.allSatisfy { $0.source == .ai })
        #expect(lines.filter { $0.priceSource == .reference }.count == 3)
        #expect(lines.filter(\.needsPrice).map(\.taskCode) == ["ELEC.CIRCUIT.NEW", "ELEC.WIRE.RUN"])
        #expect(lines.filter { $0.priceSource == .reference }.allSatisfy { $0.preliminary && $0.priceNote != nil })
        #expect(estimate.subtotal == 3020)   // 2100 + 20 × 35 + 220; unpriced lines contribute 0
        #expect(estimate.status == .draft && estimate.language == .es)
    }

    @Test func privateNotesQuestionsAndExclusionsAreKeptSeparately() async throws {
        let estimate = try await draftEstimate(notes: "PRIVATE gate code 4321. Cambiar panel…")
        #expect(estimate.internalNotes?.contains("gate code") == true)
        #expect(estimate.openQuestions?.contains("EV charger") == true)
        #expect(estimate.exclusions?.contains("Subpanel") == true)
        #expect(workspace.lines(for: estimate).allSatisfy { !$0.descriptionEn.contains("gate code") })
    }

    @Test func draftingMovesALeadToEstimating() async throws {
        #expect(job.status == .lead)
        _ = try await draftEstimate()
        #expect(job.status == .estimating)
    }

    @Test func editingAPriceMakesItTheContractorsAndUpdatesTotals() async throws {
        let estimate = try await draftEstimate()
        let wire = try #require(workspace.lines(for: estimate).first { $0.taskCode == "ELEC.WIRE.RUN" })
        var draft = LineDraft(wire)
        draft.unitPrice = Decimal(string: "3.50")!

        try workspace.save(draft, to: wire, in: estimate)

        #expect(wire.priceSource == .manual && !wire.preliminary)
        #expect(estimate.subtotal == 3370)   // + 100 × 3.50
    }

    @Test func rememberedPricesLandInThePriceBookOnce() async throws {
        let estimate = try await draftEstimate()
        let wire = try #require(workspace.lines(for: estimate).first { $0.taskCode == "ELEC.WIRE.RUN" })
        var draft = LineDraft(wire)
        draft.unitPrice = 3
        try workspace.save(draft, to: wire, in: estimate, rememberPrice: true)
        draft.unitPrice = 4
        try workspace.save(draft, to: wire, in: estimate, rememberPrice: true)

        let book = try context.fetch(FetchDescriptor<PriceBookItem>()).filter { $0.taskCode == "ELEC.WIRE.RUN" }
        #expect(book.count == 1)
        #expect(book.first?.unitPrice == 4 && book.first?.needsSync == true)
        #expect(wire.priceSource == .contractor)
    }

    @Test func yourPriceBookWinsOnTheNextDraft() async throws {
        await backend.setContractorPrice(Decimal(2600), for: "ELEC.PANEL.UPGRADE")
        let panel = try #require(workspace.lines(for: try await draftEstimate()).first { $0.taskCode == "ELEC.PANEL.UPGRADE" })
        #expect(panel.priceSource == .contractor && panel.unitPrice == 2600 && !panel.preliminary)
    }

    @Test func deletingALineRecalculates() async throws {
        let estimate = try await draftEstimate()
        let panel = try #require(workspace.lines(for: estimate).first { $0.taskCode == "ELEC.PANEL.UPGRADE" })
        try workspace.delete(panel, from: estimate)
        #expect(estimate.subtotal == 920)
        #expect(workspace.lines(for: estimate).count == 4)
    }

    @Test func offlineDraftFailsWithAClearError() async throws {
        await backend.setOffline(true)
        await #expect(throws: BackendError.offline) {
            _ = try await EstimateDrafting.draft(notes: "Cambiar panel", language: .es, service: backend)
        }
    }

    @Test func notesWithNoWorkGiveANothingFoundError() async throws {
        await #expect(throws: BackendError.nothingFound) {
            _ = try await EstimateDrafting.draft(notes: "hola", language: .es, service: EmptyService())
        }
    }
}

private struct EmptyService: EstimateService {
    func interpret(_ request: InterpretRequestBody) async throws -> InterpretResponseDTO {
        InterpretResponseDTO(interpretation: InterpretationDTO(trade: "other", projectSummaryEn: "", projectSummaryEs: "",
            tasks: [], excludedWork: [], futureWork: [], unknownDetails: [], confidenceNotes: []))
    }
    func price(_ request: PriceRequestBody) async throws -> PriceResponseDTO { fatalError("not called") }
    func refine(_ request: RefineRequestBody) async throws -> RefineResponseDTO { fatalError("not called") }
    func materials(_ request: MaterialsRequestBody) async throws -> MaterialsResponseDTO {
        MaterialsResponseDTO(materialsList: MaterialsListDTO(materials: [], assumptions: [], questions: []))
    }
}

@Suite("Bill of materials")
struct MaterialsTests {
    let backend = FakeBackend()
    let context: ModelContext
    let workspace: Workspace
    let orgID = UUID()
    let job: Job

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        context.insert(Organization(id: orgID, name: "Flores"))
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync, estimateService: backend)
        job = Job(orgId: orgID, title: "Panel", assignedTo: nil)
        context.insert(job)
    }

    private func estimateWithMaterials() async throws -> Estimate {
        let draft = try await EstimateDrafting.draft(notes: "panel", language: .en, service: backend)
        let estimate = try workspace.createEstimate(for: job, notes: "panel", language: .en, draft: draft)
        let list = try await MaterialsDrafting.draft(for: estimate, lines: workspace.lines(for: estimate), service: backend)
        try workspace.replaceMaterials(of: estimate, with: list)
        return estimate
    }

    @Test func aiListBecomesSyncedMaterialItems() async throws {
        let estimate = try await estimateWithMaterials()
        let items = workspace.materials(for: estimate)
        #expect(items.count == 4)
        #expect(items.allSatisfy { $0.needsSync && !$0.purchased })
        let wire = try #require(items.first { $0.nameEn.contains("8 AWG") })
        #expect(wire.qty == 170 && wire.evidence == .inferred && wire.note == "2 conductors × 85 ft")
        #expect(wire.specifications == "8 AWG\ncopper")
        #expect(items.map(\.position) == [0, 1, 2, 3])
    }

    @Test func rebuildKeepsPurchasedAndManualItems() async throws {
        let estimate = try await estimateWithMaterials()
        let panel = try #require(workspace.materials(for: estimate).first { $0.nameEn.contains("load center") })
        try workspace.togglePurchased(panel)
        var manual = MaterialDraft(); manual.nameEn = "Anti-oxidant compound"
        try workspace.save(manual, to: nil, in: estimate)

        let list = try await MaterialsDrafting.draft(for: estimate, lines: workspace.lines(for: estimate), service: backend)
        try workspace.replaceMaterials(of: estimate, with: list)

        let items = workspace.materials(for: estimate)
        #expect(items.count == 5, "purchased panel + manual item kept; 3 AI items replaced; no duplicate panel")
        #expect(items.filter { $0.nameEn.contains("load center") }.count == 1)
        #expect(items.first { $0.nameEn.contains("load center") }?.purchased == true)
        #expect(items.contains { $0.nameEn == "Anti-oxidant compound" && $0.evidence == .manual })
    }

    @Test func editingConfirmsAnInferredItem() async throws {
        let estimate = try await estimateWithMaterials()
        let wire = try #require(workspace.materials(for: estimate).first { $0.nameEn.contains("8 AWG") })
        var draft = MaterialDraft(wire)
        draft.qty = 180
        try workspace.save(draft, to: wire, in: estimate)
        #expect(wire.qty == 180 && wire.evidence == .manual)
    }

    @Test func materialsSyncToTheServer() async throws {
        let estimate = try await estimateWithMaterials()
        await workspace.sync.syncNow()
        let item = try #require(workspace.materials(for: estimate).first)
        #expect(await backend.row(in: "material_items", id: item.id)?.string("name_en") == item.nameEn)
        #expect(!item.needsSync)
    }

    @Test func emptyListIsANothingFoundError() async throws {
        let draft = try await EstimateDrafting.draft(notes: "panel", language: .en, service: backend)
        let estimate = try workspace.createEstimate(for: job, notes: "panel", language: .en, draft: draft)
        await #expect(throws: BackendError.nothingFound) {
            _ = try await MaterialsDrafting.draft(for: estimate, lines: self.workspace.lines(for: estimate), service: EmptyService())
        }
    }
}

@Suite("Store links")
struct StoreLinksTests {
    @Test func buildsEncodedSearchURLs() throws {
        let q = "3/4 inch EMT conduit & fittings"
        #expect(StoreLinks.url(for: .homeDepot, query: q)?.absoluteString == "https://www.homedepot.com/s/3%2F4%20inch%20EMT%20conduit%20&%20fittings")
        #expect(StoreLinks.url(for: .lowes, query: q)?.absoluteString == "https://www.lowes.com/search?searchTerm=3/4%20inch%20EMT%20conduit%20%26%20fittings")
        #expect(StoreLinks.url(for: .amazon, query: "8 AWG wire")?.absoluteString == "https://www.amazon.com/s?k=8%20AWG%20wire")
        #expect(StoreLinks.url(for: .googleShopping, query: "8 AWG wire")?.absoluteString == "https://www.google.com/search?tbm=shop&q=8%20AWG%20wire")
        #expect(StoreLinks.url(for: .lowes, query: "   ") == nil)
    }
}

@Suite("Answering the AI's questions")
struct RefinementTests {
    let backend = FakeBackend()
    let context: ModelContext
    let workspace: Workspace
    let orgID = UUID()
    let job: Job

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        context.insert(Organization(id: orgID, name: "Flores"))
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync, estimateService: backend)
        job = Job(orgId: orgID, title: "Panel", assignedTo: nil)
        context.insert(job)
    }

    private func draftedEstimate() async throws -> Estimate {
        let draft = try await EstimateDrafting.draft(notes: "Cambiar panel…", language: .es, service: backend)
        return try workspace.createEstimate(for: job, notes: "Cambiar panel…", language: .es, draft: draft)
    }

    private func answers() -> [QuestionAnswer] {
        [QuestionAnswer(question: "Is the EV charger supplied by the customer?", answer: "Yes, they bought it"),
         QuestionAnswer(question: "How long is the run?", answer: "85 feet")]
    }

    @Test func proposalIsPricedButNothingChangesUntilApplied() async throws {
        let estimate = try await draftedEstimate()
        let lines = workspace.lines(for: estimate)
        let before = estimate.subtotal

        let proposal = try await EstimateRefining.propose(notes: "", language: .es, lines: lines, answers: answers(), service: backend)

        #expect(proposal.adds.map(\.taskCode) == ["ELEC.EV.CHARGER.INSTALL"])
        #expect(proposal.adds.first?.priceSource == "none", "uncataloged price → needs price, never invented")
        #expect(proposal.updates.count == 1 && lines[proposal.updates[0].ref].taskCode == "ELEC.WIRE.RUN")
        #expect(workspace.lines(for: estimate).count == 5 && estimate.subtotal == before, "nothing applied yet")
    }

    @Test func applyingAddsLinesUpdatesQuantitiesAndRecordsAnswers() async throws {
        let estimate = try await draftedEstimate()
        let lines = workspace.lines(for: estimate)
        let proposal = try await EstimateRefining.propose(notes: "", language: .es, lines: lines, answers: answers(), service: backend)

        try workspace.apply(proposal, to: estimate, lines: lines,
                            addIndexes: Set(proposal.adds.indices), updateIndexes: Set(proposal.updates.indices))

        let after = workspace.lines(for: estimate)
        #expect(after.count == 6)
        #expect(after.last?.taskCode == "ELEC.EV.CHARGER.INSTALL" && after.last?.source == .ai && after.last?.needsPrice == true)
        #expect(after.first { $0.taskCode == "ELEC.WIRE.RUN" }?.qty == 85)
        #expect(estimate.openQuestions == nil, "all questions answered")
        #expect(estimate.internalNotes?.contains("A: 85 feet") == true, "answers kept privately")
        #expect(estimate.exclusions?.contains("supplied by the customer") == true)
        #expect(after.allSatisfy { !$0.descriptionEn.contains("Q:") }, "answers never leak into line items")
    }

    @Test func unselectedChangesAreSkipped() async throws {
        let estimate = try await draftedEstimate()
        let lines = workspace.lines(for: estimate)
        let proposal = try await EstimateRefining.propose(notes: "", language: .es, lines: lines, answers: answers(), service: backend)

        try workspace.apply(proposal, to: estimate, lines: lines, addIndexes: [], updateIndexes: [])

        #expect(workspace.lines(for: estimate).count == 5)
        #expect(workspace.lines(for: estimate).first { $0.taskCode == "ELEC.WIRE.RUN" }?.qty == 100)
        #expect(estimate.internalNotes?.contains("Q: How long is the run?") == true, "answers still saved")
    }

    @Test func refineOfflineFailsClearly() async throws {
        let estimate = try await draftedEstimate()
        await backend.setOffline(true)
        await #expect(throws: BackendError.offline) {
            _ = try await EstimateRefining.propose(notes: "", language: .es, lines: self.workspace.lines(for: estimate),
                                                   answers: self.answers(), service: self.backend)
        }
    }
}

@Suite("Backend client wire format")
struct BackendClientTests {
    @Test func decodesExactDecimalsFromTheServer() throws {
        let json = """
        {"region_code":"US-CA-LA","overhead_pct":"0.10","profit_pct":"0.10","subtotal":"3020.00","priced_lines":1,
         "unpriced_lines":1,"preliminary":true,"disclaimer":"Preliminary estimate.",
         "lines":[{"task_code":"ELEC.PANEL.UPGRADE","description_en":"Panel","description_es":"Panel","quantity":"1.0",
                   "unit":"job","unit_price":"2100.00","line_total":"2100.00","price_source":"reference","basis":"benchmark_bid",
                   "preliminary":true,"confidence":"low","source_name":"Pilot","applies_to":"200A panel","note":null,"needs":[]},
                  {"task_code":null,"description_en":"Patch","description_es":"","quantity":null,"unit":null,"unit_price":null,
                   "line_total":null,"price_source":"none","basis":"none","preliminary":true,"confidence":"none",
                   "source_name":null,"applies_to":null,"note":null,"needs":["price","quantity"]}]}
        """
        let response: PriceResponseDTO = try BackendClient.decode(data: Data(json.utf8), status: 200)
        #expect(response.subtotal.value == Decimal(string: "3020.00"))
        #expect(response.lines[0].unitPrice?.value == Decimal(string: "2100.00"))
        #expect(response.lines[1].needs == ["price", "quantity"])
    }

    @Test(arguments: [("access_denied", BackendError.signedOut), ("no_business", .signedOut), ("ai_rate_limited", .busy),
                      ("rate_limited", .busy), ("ai_timeout", .timedOut), ("ai_provider_failed", .server(code: "ai_provider_failed"))])
    func mapsServerErrorCodes(code: String, expected: BackendError) {
        let body = Data(#"{"error":"\#(code)","message":"x"}"#.utf8)
        #expect(throws: expected) { let _: PriceResponseDTO = try BackendClient.decode(data: body, status: 429) }
    }

    @Test func encodesSnakeCase() throws {
        let body = try BackendClient.encoder.encode(InterpretRequestBody(description: "x", language: "es"))
        let json = try #require(String(data: body, encoding: .utf8))
        #expect(json.contains("\"description\"") && json.contains("\"language\":\"es\""))
    }
}

@Suite("Database upgrade V2 → V3", .serialized)
struct MigrationV3Tests {
    @Test func v2StoresGainMaterialsWithoutLosingData() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("migration-v3-\(UUID().uuidString).store")
        defer { try? FileManager.default.removeItem(at: url) }
        let orgID = UUID(), estimateID = UUID()
        do {
            let v2 = try ModelContainer(for: Schema(versionedSchema: SchemaV2.self), configurations: ModelConfiguration(url: url))
            let context = ModelContext(v2)
            let line = LineItem(orgId: orgID, estimateId: estimateID, descriptionEn: "Panel")
            line.taskCode = "ELEC.PANEL.UPGRADE"
            context.insert(line)
            try context.save()
        }
        let v3 = ModelContext(try AppSchema.makeContainer(url: url))
        #expect(try v3.fetch(FetchDescriptor<LineItem>()).first?.taskCode == "ELEC.PANEL.UPGRADE")
        v3.insert(MaterialItem(orgId: orgID, estimateId: estimateID, nameEn: "Load center"))
        try v3.save()
        #expect(try v3.fetchCount(FetchDescriptor<MaterialItem>()) == 1)
    }
}

@Suite("Database upgrade V1 → V2", .serialized)
struct MigrationTests {
    @Test func oldStoresOpenWithDataIntactAndNewFieldsDefaulted() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("migration-\(UUID().uuidString).store")
        defer { try? FileManager.default.removeItem(at: url) }
        let orgID = UUID(), estimateID = UUID(), lineID = UUID()
        do {
            let v1 = try ModelContainer(for: Schema(versionedSchema: SchemaV1.self), configurations: ModelConfiguration(url: url))
            let context = ModelContext(v1)
            context.insert(SchemaV1.Estimate(id: estimateID, orgId: orgID, jobId: UUID()))
            context.insert(SchemaV1.LineItem(id: lineID, orgId: orgID, estimateId: estimateID, descriptionEn: "Old line"))
            context.insert(Client(orgId: orgID, name: "Ana"))
            try context.save()
        }

        let v2 = ModelContext(try AppSchema.makeContainer(url: url))
        let line = try #require(try v2.fetch(FetchDescriptor<LineItem>()).first)
        #expect(line.id == lineID && line.descriptionEn == "Old line")
        #expect(line.priceSource == .manual && !line.preliminary && line.taskCode == nil)
        #expect(try v2.fetch(FetchDescriptor<Estimate>()).first?.internalNotes == nil)
        #expect(try v2.fetch(FetchDescriptor<Client>()).first?.name == "Ana")
    }
}
