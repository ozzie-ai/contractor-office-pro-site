import Foundation

/// A contractor's imported blueprint PDF is local-only until they explicitly
/// request an AI review of a rasterized page. The complete PDF is never
/// uploaded automatically.
nonisolated enum PrivateBlueprintStore {
    enum Failure: Error { case invalidPDF, tooLarge }
    static let maxBytes = 15_000_000

    static func load(jobID: UUID) -> URL? {
        guard let url = try? file(jobID: jobID),
              FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    @discardableResult
    static func save(_ contents: Data, jobID: UUID) throws -> URL {
        guard contents.starts(with: Data("%PDF-".utf8)) else { throw Failure.invalidPDF }
        guard contents.count <= maxBytes else { throw Failure.tooLarge }
        let url = try file(jobID: jobID)
        try contents.write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
        return url
    }

    static func clear(jobID: UUID) {
        guard let url = try? file(jobID: jobID) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private static func file(jobID: UUID) throws -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PrivateBlueprints", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root.appendingPathComponent(jobID.uuidString + ".pdf")
    }
}
