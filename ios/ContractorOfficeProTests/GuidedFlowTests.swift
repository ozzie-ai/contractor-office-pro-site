import Foundation
import PDFKit
import SwiftData
import Testing
import UIKit
@testable import ContractorOfficePro

@Suite("Note composer")
struct NoteComposerTests {
    @Test(arguments: [("", "Panel upgrade", "Panel upgrade"),
                      ("Panel upgrade", "EV charger", "Panel upgrade, EV charger"),
                      ("Panel upgrade,", "EV charger", "Panel upgrade, EV charger"),
                      ("Cambiar panel.", "cargador", "Cambiar panel. cargador"),
                      ("Notes  ", "   ", "Notes  ")])
    func appendsWithoutOverwriting(existing: String, piece: String, expected: String) {
        #expect(NoteComposer.append(piece, to: existing) == expected)
    }
}

@Suite("Guided new estimate")
struct GuidedFlowTests {
    let backend = FakeBackend()
    let context: ModelContext
    let workspace: Workspace
    let orgID = UUID()

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let org = Organization(id: orgID, name: "Flores Electric")
        org.cslbLicense = "1234567"; org.phone = "(323) 555-0100"
        context.insert(org)
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync, estimateService: backend)
    }

    private func draft() async throws -> EstimateDraft {
        try await EstimateDrafting.draft(notes: "Panel upgrade, EV charger", language: .es, trade: .electrical, service: backend)
    }

    @Test func createsClientJobAndEstimateInOneStep() async throws {
        let estimate = try workspace.createQuickEstimate(trade: .electrical, client: nil, newClientName: "  Ana López ",
                                                         newClientPhone: "323-555-0142", notes: "Panel upgrade",
                                                         language: .es, draft: try await draft())
        let client = try #require(try context.fetch(FetchDescriptor<Client>()).first)
        let job = try #require(try context.fetch(FetchDescriptor<Job>()).first)
        #expect(client.name == "Ana López" && client.phone == "323-555-0142" && client.preferredLanguage == .es)
        #expect(job.clientId == client.id && job.status == .estimating)
        #expect(job.title == "\(String(localized: Trade.electrical.title)) · Ana López")
        #expect(estimate.jobId == job.id && workspace.lines(for: estimate).count == 5)
    }

    @Test func skippingTheClientStillWorks() async throws {
        _ = try workspace.createQuickEstimate(trade: .plumbing, client: nil, newClientName: nil, newClientPhone: nil,
                                              notes: "Water heater", language: .en, draft: try await draft())
        #expect(try context.fetch(FetchDescriptor<Client>()).isEmpty)
        #expect(try context.fetch(FetchDescriptor<Job>()).first?.title == String(localized: Trade.plumbing.title))
    }

    @Test func tradeHintIsSentToTheAI() throws {
        let body = try BackendClient.encoder.encode(InterpretRequestBody(description: "x", language: "es", tradeHint: "electrical"))
        #expect(String(decoding: body, as: UTF8.self).contains("\"trade_hint\":\"electrical\""))
    }

    @Test func sendIsBlockedUntilEveryLineHasAPriceAndQuantity() async throws {
        await backend.setBallparkAvailable(false)
        let estimate = try workspace.createQuickEstimate(trade: .electrical, client: nil, newClientName: nil, newClientPhone: nil,
                                                         notes: "x", language: .en, draft: try await draft())
        let lines = workspace.lines(for: estimate)
        #expect(EstimateReadiness.check(lines) == .missing(prices: 2, quantities: 0))
        for line in lines where line.needsPrice {
            var d = LineDraft(line); d.unitPrice = 50
            try workspace.save(d, to: line, in: estimate)
        }
        #expect(EstimateReadiness.check(workspace.lines(for: estimate)) == .ready)
        #expect(EstimateReadiness.check([]) == .empty)
    }

    @Test func aiBallparksAllowSendingWithAReminder() async throws {
        let estimate = try workspace.createQuickEstimate(trade: .electrical, client: nil, newClientName: nil, newClientPhone: nil,
                                                         notes: "x", language: .en, draft: try await draft())
        let lines = workspace.lines(for: estimate)
        #expect(EstimateReadiness.check(lines) == .ready)
        #expect(EstimateReadiness.unconfirmedAIPrices(lines) == 2)
        let guess = try #require(lines.first { $0.isAIBallpark })
        try workspace.confirmPrice(of: guess, in: estimate)
        #expect(EstimateReadiness.unconfirmedAIPrices(workspace.lines(for: estimate)) == 1)
    }

    @Test func photosFromTheFlowAreSavedOnTheJobAndSentToTheAI() async throws {
        let photo = try #require(PhotoStore.prepare(Self.testJPEG(width: 3000, height: 2000)))
        let image = try #require(PhotoStore.aiImage(from: photo))
        let draft = try await EstimateDrafting.draft(notes: "Panel upgrade", language: .en, trade: .electrical,
                                                     images: [image, image], service: backend)
        #expect(await backend.lastInterpretImages == 2)
        let estimate = try workspace.createQuickEstimate(trade: .electrical, client: nil, newClientName: nil, newClientPhone: nil,
                                                         notes: "x", language: .en, photos: [photo], draft: draft)
        let job = try #require(try context.fetch(FetchDescriptor<Job>()).first { $0.id == estimate.jobId })
        let saved = workspace.photos(for: job)
        #expect(saved.count == 1 && saved[0].needsSync && saved[0].kind == .photo)
        let name = try #require(saved[0].localFileName)
        #expect(FileManager.default.fileExists(atPath: PhotoStore.shared.url(for: name).path))
        try workspace.delete(saved[0])
        #expect(workspace.photos(for: job).isEmpty)
        #expect(!FileManager.default.fileExists(atPath: PhotoStore.shared.url(for: name).path), "file removed from the phone")
    }

    @Test func photosAreShrunkForStorageAndMoreForTheAI() throws {
        let stored = try #require(PhotoStore.prepare(Self.testJPEG(width: 4000, height: 3000)))
        let size = try #require(UIImage(data: stored)).size
        #expect(max(size.width, size.height) == 2048)
        let ai = try #require(PhotoStore.aiImage(from: stored))
        let aiData = try #require(Data(base64Encoded: ai.dataBase64))
        #expect(aiData.count < 2_000_000 && ai.contentType == "image/jpeg")
        let aiImage = try #require(UIImage(data: aiData))
        #expect(aiImage.size.width == 1024)
        #expect(PhotoStore.prepare(Data("not an image".utf8)) == nil)
    }

    static func testJPEG(width: CGFloat, height: CGFloat) -> Data {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).jpegData(withCompressionQuality: 0.5) { ctx in
            UIColor.systemGreen.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    @Test func markingSentRecordsLanguageAndTime() async throws {
        let estimate = try workspace.createQuickEstimate(trade: .electrical, client: nil, newClientName: nil, newClientPhone: nil,
                                                         notes: "x", language: .en, draft: try await draft())
        try workspace.markSent(estimate, language: .es)
        #expect(estimate.status == .sent && estimate.language == .es && estimate.sentAt != nil && estimate.needsSync)
    }
}

@Suite("Customer PDF")
struct EstimatePDFTests {
    let context: ModelContext
    let workspace: Workspace
    let backend = FakeBackend()
    let orgID = UUID()

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        let org = Organization(id: orgID, name: "Flores Electric")
        org.cslbLicense = "1234567"; org.phone = "(323) 555-0100"
        context.insert(org)
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync, estimateService: backend)
    }

    private func pdfText(language: AppLanguage) async throws -> String {
        let draft = try await EstimateDrafting.draft(notes: "x", language: .es, trade: .electrical, service: backend)
        let estimate = try workspace.createQuickEstimate(trade: .electrical, client: nil, newClientName: "Ana López",
                                                         newClientPhone: nil, notes: "PRIVATE gate code 4321",
                                                         language: .es, draft: draft)
        let job = try context.fetch(FetchDescriptor<Job>()).first
        let client = try context.fetch(FetchDescriptor<Client>()).first
        let input = EstimatePDF.input(estimate: estimate, lines: workspace.lines(for: estimate),
                                      organization: workspace.organization, client: client, job: job, language: language)
        let data = EstimatePDF.render(input, language: language)
        return try #require(PDFDocument(data: data)?.string)
    }

    @Test func englishPDFHasBusinessClientLinesAndTotal() async throws {
        let text = try await pdfText(language: .en)
        #expect(text.contains("Flores Electric") && text.contains("1234567") && text.contains("Ana López"))
        #expect(text.contains("ESTIMATE") && text.contains("Replace the existing 100A panel"))
        #expect(text.contains("$3,830.00"), "total from code: references + code-computed ballparks")
        #expect(text.contains("Not included") && text.contains("Subpanel"))
    }

    @Test func spanishPDFUsesSpanishLabelsAndDescriptions() async throws {
        let text = try await pdfText(language: .es)
        #expect(text.contains("PRESUPUESTO") && text.contains("Reemplazar el panel de 100A"))
        #expect(text.contains("No incluido") && !text.contains("DESCRIPTION"))
        #expect(text.contains("20 pza") && text.contains("1 trabajo") && !text.contains(" each"), "units in Spanish")
    }

    @Test(arguments: [AppLanguage.en, .es])
    func privateDataNeverAppears(language: AppLanguage) async throws {
        let text = try await pdfText(language: language)
        for secret in ["gate code", "4321", "EV charger supplied", "Where is the panel", "Pilot LA", "preliminary", "allowance"] {
            #expect(!text.localizedCaseInsensitiveContains(secret), "\(secret) leaked into the customer PDF")
        }
    }
}
