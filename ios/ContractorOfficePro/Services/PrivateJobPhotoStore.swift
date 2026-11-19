import Foundation

/// Photos are private local evidence, not customer-PDF content or AI uploads.
/// The caller must explicitly consent before any future remote analysis.
nonisolated enum PrivateJobPhotoStore {
    enum Failure: Error { case tooLarge, invalidImageData, storageUnavailable }

    static let maximumPhotos = 8
    static let maximumBytes = 10_000_000

    static func files(jobID: UUID) -> [URL] {
        guard let folder = try? directory(jobID: jobID) else { return [] }
        let files = (try? FileManager.default.contentsOfDirectory(
            at: folder, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        )) ?? []
        return files.filter { $0.pathExtension == "photo" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// Import a copy into the application's protected Application Support folder.
    /// Never keep a Photos library URL or leak its metadata to the PDF.
    @discardableResult
    static func save(_ bytes: Data, jobID: UUID) throws -> URL {
        guard !bytes.isEmpty else { throw Failure.invalidImageData }
        guard bytes.count <= maximumBytes else { throw Failure.tooLarge }
        guard files(jobID: jobID).count < maximumPhotos else { throw Failure.storageUnavailable }
        let folder = try directory(jobID: jobID)
        let destination = folder.appendingPathComponent(UUID().uuidString + ".photo")
        try bytes.write(to: destination, options: [.atomic, .completeFileProtectionUnlessOpen])
        return destination
    }

    static func remove(_ url: URL, jobID: UUID) throws {
        let folder = try directory(jobID: jobID).standardizedFileURL
        guard url.standardizedFileURL.deletingLastPathComponent() == folder,
              url.pathExtension == "photo" else { throw Failure.storageUnavailable }
        try FileManager.default.removeItem(at: url)
    }

    static func clear(jobID: UUID) {
        guard let folder = try? directory(jobID: jobID) else { return }
        try? FileManager.default.removeItem(at: folder)
    }

    private static func directory(jobID: UUID) throws -> URL {
        let support = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        )[0]
        let folder = support.appendingPathComponent("PrivateJobPhotos", isDirectory: true)
            .appendingPathComponent(jobID.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
}
