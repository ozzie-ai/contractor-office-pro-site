import Foundation
import SwiftData

@Model
final class Organization: Syncable {
    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var name: String
    var cslbLicense: String?
    var address: String?
    var phone: String?
    var email: String?
    var defaultLanguageRaw: String
    var taxRate: Decimal
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var defaultLanguage: AppLanguage {
        get { AppLanguage(rawValue: defaultLanguageRaw) ?? .en }
        set { defaultLanguageRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), name: String, defaultLanguage: AppLanguage = .en, taxRate: Decimal = 0, now: Date = .now) {
        self.id = id
        self.orgId = id
        self.name = name
        self.defaultLanguageRaw = defaultLanguage.rawValue
        self.taxRate = taxRate
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}

@Model
final class Member: Syncable {
    enum Role: String, Codable, Sendable { case owner, admin, crew }

    @Attribute(.unique) var id: UUID
    var orgId: UUID
    var userId: UUID?
    var displayName: String
    var roleRaw: String
    var phone: String?
    var preferredLanguageRaw: String
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?
    var needsSync: Bool

    var role: Role {
        get { Role(rawValue: roleRaw) ?? .crew }
        set { roleRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), orgId: UUID, userId: UUID? = nil, displayName: String, role: Role = .owner,
         preferredLanguage: AppLanguage = .en, now: Date = .now) {
        self.id = id
        self.orgId = orgId
        self.userId = userId
        self.displayName = displayName
        self.roleRaw = role.rawValue
        self.preferredLanguageRaw = preferredLanguage.rawValue
        self.createdAt = now
        self.updatedAt = now
        self.needsSync = true
    }
}
