import Foundation
import SwiftData

@Model nonisolated
final class Client: Syncable {
    enum SMSConsent: String, Codable, Sendable { case unknown, granted, revoked }

    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var name: String
    var phone: String?
    var email: String?
    var address: String?
    var preferredLanguageRaw: String
    var smsConsentRaw: String
    var smsConsentAt: Date?
    /// CA: buyers 65+ get a 5-business-day right to cancel (Phase 1 contracts).
    var isSenior65Plus: Bool
    var notes: String?
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var preferredLanguage: AppLanguage {
        get { AppLanguage(rawValue: preferredLanguageRaw) ?? .en }
        set { preferredLanguageRaw = newValue.rawValue }
    }

    var smsConsent: SMSConsent {
        get { SMSConsent(rawValue: smsConsentRaw) ?? .unknown }
        set { smsConsentRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, name: String, preferredLanguage: AppLanguage = .en, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.name = name
        self.preferredLanguageRaw = preferredLanguage.rawValue
        self.smsConsentRaw = SMSConsent.unknown.rawValue
        self.isSenior65Plus = false
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
