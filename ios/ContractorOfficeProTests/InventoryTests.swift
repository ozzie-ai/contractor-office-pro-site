import Foundation
import SwiftData
import Testing
import UIKit
@testable import ContractorOfficePro

@Suite("Leftover matching")
struct StockMatcherTests {
    @Test(arguments: [
        ("8 AWG THHN copper wire", "8 AWG THHN wire", true),
        ("8 AWG THHN wire", "6 AWG THHN wire", false),          // sizes must match exactly
        ("40A double-pole breaker", "20A breaker", false),
        ("3/4 in. EMT conduit", "3/4 inch EMT conduit", true),
        ("GFCI receptacles", "GFCI receptacle", true),
        ("Wire nuts", "Load center", false),
    ])
    func similarNamesMatchOnlyWithTheSameSizes(a: String, b: String, matches: Bool) {
        #expect((StockMatcher.similarity(a, b) >= 0.6) == matches)
    }

    @Test func unitsMustBeTheSameKind() {
        #expect(StockMatcher.unitFamily("linear ft") == StockMatcher.unitFamily("feet"))
        #expect(StockMatcher.unitFamily("ea") == StockMatcher.unitFamily("each"))
        #expect(StockMatcher.unitFamily("ft") != StockMatcher.unitFamily("each"))
    }

    @Test func leftoverShareRoundsSensibly() {
        #expect(LeftoverShare.half.amount(of: 170, unit: "ft") == 85)
        #expect(LeftoverShare.little.amount(of: 3, unit: "each") == 1)   // 0.75 → 1 whole piece
        #expect(LeftoverShare.most.amount(of: Decimal(string: "2.5")!, unit: "gal") == Decimal(string: "1.88"))
        #expect(LeftoverShare.none.amount(of: 10, unit: "ft") == 0)
    }
}

@Suite("Truck stock and tools")
struct InventoryTests {
    let backend = FakeBackend()
    let context: ModelContext
    let workspace: Workspace
    let orgID = UUID()
    let estimate: Estimate

    init() throws {
        context = ModelContext(try AppSchema.makeContainer(inMemory: true))
        context.insert(Organization(id: orgID, name: "Flores"))
        let sync = SyncEngine(transport: backend, context: context, orgID: orgID, defaults: PreviewData.ephemeralDefaults())
        workspace = Workspace(orgID: orgID, memberID: UUID(), context: context, sync: sync, estimateService: backend)
        estimate = Estimate(orgId: orgID, jobId: UUID())
        context.insert(estimate)
    }

    private func material(_ name: String, _ qty: Decimal, _ unit: String) -> MaterialItem {
        let item = MaterialItem(orgId: orgID, estimateId: estimate.id, nameEn: name, category: "electrical", qty: qty, unit: unit)
        context.insert(item)
        return item
    }

    @Test func leftoversGoOnTheTruckAndTopUpMatches() throws {
        let wire = material("8 AWG THHN copper wire", 170, "ft")
        let breaker = material("40A double-pole breaker", 1, "each")
        #expect(try workspace.saveLeftovers([wire.id: 85, breaker.id: 0], from: [wire, breaker], estimate: estimate) == 1)
        let again = material("8 AWG THHN copper wire", 100, "linear ft")
        try workspace.saveLeftovers([again.id: 15], from: [again], estimate: estimate)
        let stock = workspace.stock()
        #expect(stock.count == 1, "same wire tops up instead of duplicating")
        #expect(stock.first?.qty == 100 && stock.first?.unit == "ft" && stock.first?.needsSync == true)
        #expect(stock.first?.sourceEstimateId == estimate.id)
    }

    @Test func nextMaterialsListOffersTheLeftoverAndUsingItMarksItBought() throws {
        let old = material("8 AWG THHN copper wire", 170, "ft")
        try workspace.saveLeftovers([old.id: 120], from: [old], estimate: estimate)
        let needed = material("8 AWG THHN wire", 85, "ft")
        let other = material("6 AWG THHN wire", 85, "ft")
        let stock = workspace.stock()
        let match = try #require(StockMatcher.match(for: needed, in: stock))
        #expect(StockMatcher.match(for: other, in: stock) == nil, "different gauge is never offered")

        try workspace.use(match, for: needed)
        #expect(needed.purchased && match.qty == 35 && match.deletedAt == nil)
        let more = material("8 AWG THHN wire", 50, "ft")
        try workspace.use(match, for: more)
        #expect(match.qty == 0 && match.deletedAt != nil, "used up → removed from the truck")
        #expect(workspace.stock().isEmpty)
    }

    @Test func bulkToolsShareTheirPhotoAndQuantitiesBecomeSeparateTools() throws {
        let store = PhotoStore(directory: URL.temporaryDirectory.appending(path: "tools-\(UUID().uuidString)"))
        let photo = try #require(PhotoStore.prepare(GuidedFlowTests.testJPEG(width: 800, height: 600)))
        let dto = { (index: Int, name: String, qty: Int) in
            IdentifiedToolDTO(photoIndex: index, nameEn: name, nameEs: "", brand: nil, model: nil, serialNumber: nil,
                              category: "tester", quantity: qty, noteEn: "")
        }
        let added = try workspace.addTools([ToolPick(dto(0, "Voltage tester", 2)), ToolPick(dto(0, "Fish tape", 1))],
                                           photos: [photo], store: store)
        #expect(added.count == 3)
        let file = try #require(added[0].photoFileName)
        #expect(added.allSatisfy { $0.photoFileName == file }, "one file per photo")

        try workspace.delete(added[0], store: store)
        #expect(FileManager.default.fileExists(atPath: store.url(for: file).path), "still used by other tools")
        try workspace.delete(added[1], store: store)
        try workspace.delete(added[2], store: store)
        #expect(!FileManager.default.fileExists(atPath: store.url(for: file).path), "removed with the last tool")
    }

    @Test func whoHasItRemembersPeopleMostUsedFirst() throws {
        let tools = try workspace.addTools((0..<3).map { _ in
            ToolPick(IdentifiedToolDTO(photoIndex: 0, nameEn: "Drill", nameEs: "", brand: nil, model: nil, serialNumber: nil,
                                       category: "power_tool", quantity: 1, noteEn: ""))
        }, photos: [])
        try workspace.setHolder("Carlos", for: tools[0])
        try workspace.setHolder("Carlos", for: tools[1])
        try workspace.setHolder("Ana's job", for: tools[2])
        #expect(workspace.toolHolders() == ["Carlos", "Ana's job"])
        try workspace.setHolder("  ", for: tools[2])
        #expect(tools[2].holder == nil, "blank means back in the truck")
    }

    @Test func toolFindingSendsPhotosInBatchesOfFive() async throws {
        let photo = try #require(PhotoStore.prepare(GuidedFlowTests.testJPEG(width: 600, height: 400)))
        var progress: [Int] = []
        let picks = try await ToolFinding.find(in: Array(repeating: photo, count: 7), language: .en, service: backend) {
            progress.append($0)
        }
        #expect(progress == [5, 7])
        #expect(await backend.toolPhotosSeen == 7)
        #expect(picks.map(\.photoIndex).max() == 6, "photo indexes are offset per batch")
        #expect(picks.first?.nameEn == "Cordless drill" && picks.first?.brand == "DeWalt")
    }

    @Test func noToolsFoundIsAClearError() async throws {
        let photo = try #require(PhotoStore.prepare(GuidedFlowTests.testJPEG(width: 600, height: 400)))
        await backend.setOffline(true)
        await #expect(throws: BackendError.offline) {
            _ = try await ToolFinding.find(in: [photo], language: .en, service: backend)
        }
    }
}
