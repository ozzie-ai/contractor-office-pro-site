import Foundation

/// Device-local, file-protected capture drafts. No upload, analytics, or logging.
/// Job IDs are UUIDs, so they cannot escape the application-support folder.
nonisolated enum PrivateJobDraftStore {
    static func load(jobID: UUID) -> String {
        guard let location = try? file(jobID: jobID),
              let data = try? Data(contentsOf: location),
              let note = String(data: data, encoding: .utf8) else { return "" }
        return note
    }

    static func save(_ text: String, jobID: UUID) {
        guard text.utf8.count <= 10000, let location = try? file(jobID: jobID) else { return }
        // Complete-file-protection-unless-open keeps private notes inaccessible
        // while the phone is locked, without introducing an account dependency.
        try? Data(text.utf8).write(to: location,
                                    options: [.atomic, .completeFileProtectionUnlessOpen])
    }

    static func clear(jobID: UUID) {
        guard let location = try? file(jobID: jobID) else { return }
        try? FileManager.default.removeItem(at: location)
    }

    private static func file(jobID: UUID) throws -> URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PrivateJobDrafts", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent(jobID.uuidString + ".txt", isDirectory: false)
    }
}
