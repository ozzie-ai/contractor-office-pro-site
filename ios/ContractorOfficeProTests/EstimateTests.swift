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
