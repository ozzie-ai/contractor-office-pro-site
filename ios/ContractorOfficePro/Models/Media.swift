import Foundation
import SwiftData

@Model
final class Media: Syncable {
    enum Kind: String, Codable, Sendable { case photo, voice }
    enum UploadState: String, Codable, Sendable { case pending, uploaded, failed }

    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var jobId: UUID?
    var kindRaw: String
    /// Remote path '{orgId}/{jobId}/{id}.{ext}' once uploaded.
    var storagePath: String?
    var uploadStateRaw: String
    /// Local-only: file name under Application Support/Media. Not synced.
    var localFileName: String?
    var durationSeconds: Double?
    var transcript: String?
    var transcriptLanguageRaw: String?
    var capturedAt: Date
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var kind: Kind {
        get { Kind(rawValue: kindRaw) ?? .photo }
        set { kindRaw = newValue.rawValue }
    }

    var uploadState: UploadState {
        get { UploadState(rawValue: uploadStateRaw) ?? .pending }
        set { uploadStateRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, jobId: UUID?, kind: Kind, localFileName: String?, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.jobId = jobId
        self.kindRaw = kind.rawValue
        self.uploadStateRaw = UploadState.pending.rawValue
        self.localFileName = localFileName
        self.capturedAt = now
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
