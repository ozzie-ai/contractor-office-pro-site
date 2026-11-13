import Foundation
import SwiftData

@Model nonisolated
final class Job: Syncable {
    enum Status: String, Codable, CaseIterable, Sendable {
        case lead, estimating, scheduled, inProgress = "in_progress", completed, cancelled
    }

    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var clientId: UUID?
    var title: String
    var address: String?
    var statusRaw: String
    /// Member id. Defaults to the owner (solo-first, dispatch-ready).
    var assignedTo: UUID?
    var scheduledStart: Date?
    var scheduledEnd: Date?
    var notes: String?
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var status: Status {
        get { Status(rawValue: statusRaw) ?? .lead }
        set { statusRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, clientId: UUID? = nil, title: String, assignedTo: UUID?, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.clientId = clientId
        self.title = title
        self.statusRaw = Status.lead.rawValue
        self.assignedTo = assignedTo
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

@Model nonisolated
final class TimeEntry: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var jobId: UUID
    var memberId: UUID?
    var clockIn: Date
    var clockOut: Date?
    var notes: String?
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var duration: TimeInterval? { clockOut.map { $0.timeIntervalSince(clockIn) } }

    init(id: UUID = UUID(), orgId: UUID, jobId: UUID, memberId: UUID?, clockIn: Date = .now, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.jobId = jobId
        self.memberId = memberId
        self.clockIn = clockIn
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
