import Foundation

/// Contractor-private editable estimate state; never appears in client PDFs.
/// Device-local and protected. The final approved estimate is stored separately
/// through SwiftData/Workspace.
nonisolated struct EstimateReviewDraft: Codable, Equatable {
    struct Item: Codable, Equatable {
        var taskCode: String
        var descriptionEn: String
        var descriptionEs: String
        var scopeID: String
        var quantity: String
        var unit: String
        var laborHours: String
        var laborRate: String
        var materialCost: String
        var selectedRateID: String
        var priceSource: String
        var requiresConfirmation: Bool
        var confirmed: Bool
    }

    var version: Int = 1
    var items: [Item]
    var unknowns: [String]
    var resolvedUnknowns: [String]
    var exclusions: [String]
    var overhead: String
    var profit: String
    var tripCost: String
    var customerLanguage: String
}

nonisolated enum PrivateEstimateReviewStore {
    static func load(jobID: UUID) -> EstimateReviewDraft? {
        guard let url = try? file(jobID: jobID),
              let data = try? Data(contentsOf: url),
              let saved = try? JSONDecoder().decode(EstimateReviewDraft.self, from: data),
              saved.version == 1, saved.items.count <= 100 else { return nil }
        return saved
    }

    @discardableResult
    static func save(_ review: EstimateReviewDraft, jobID: UUID) -> Bool {
        guard review.items.count <= 100,
              let data = try? JSONEncoder().encode(review),
              data.count <= 250_000,
              let url = try? file(jobID: jobID) else { return false }
        do {
            try data.write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
            return true
        } catch { return false }
    }

    static func clear(jobID: UUID) {
        guard let url = try? file(jobID: jobID) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private static func file(jobID: UUID) throws -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PrivateEstimateReviews", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root.appendingPathComponent(jobID.uuidString + ".json")
    }
}
