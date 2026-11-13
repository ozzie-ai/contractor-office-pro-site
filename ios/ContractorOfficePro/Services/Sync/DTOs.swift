import Foundation

/// Wire formats for Supabase rows (snake_case). Step 5 adds the rest of the tables.
struct OrganizationDTO: Codable, Sendable {
    var id: UUID
    var orgId: UUID
    var name: String
    var cslbLicense: String?
    var address: String?
    var phone: String?
    var email: String?
    var defaultLanguage: String
    var taxRate: Decimal
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, address, phone, email
        case orgId = "org_id", cslbLicense = "cslb_license", defaultLanguage = "default_language"
        case taxRate = "tax_rate", createdAt = "created_at", updatedAt = "updated_at"
        case serverUpdatedAt = "server_updated_at", deletedAt = "deleted_at"
    }
}

struct MemberDTO: Codable, Sendable {
    var id: UUID
    var orgId: UUID
    var userId: UUID?
    var displayName: String
    var role: String
    var phone: String?
    var preferredLanguage: String
    var createdAt: Date
    var updatedAt: Date
    var serverUpdatedAt: Date?
    var deletedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, role, phone
        case orgId = "org_id", userId = "user_id", displayName = "display_name"
        case preferredLanguage = "preferred_language", createdAt = "created_at", updatedAt = "updated_at"
        case serverUpdatedAt = "server_updated_at", deletedAt = "deleted_at"
    }
}

extension Organization {
    convenience init(_ dto: OrganizationDTO) {
        self.init(id: dto.id, name: dto.name, defaultLanguage: AppLanguage(rawValue: dto.defaultLanguage) ?? .en,
                  taxRate: dto.taxRate, now: dto.createdAt)
        apply(dto)
    }

    func apply(_ dto: OrganizationDTO) {
        name = dto.name
        cslbLicense = dto.cslbLicense
        address = dto.address
        phone = dto.phone
        email = dto.email
        defaultLanguageRaw = dto.defaultLanguage
        taxRate = dto.taxRate
        updatedAt = dto.updatedAt
        serverUpdatedAt = dto.serverUpdatedAt
        deletedAt = dto.deletedAt
        needsSync = false
    }
}

extension Member {
    convenience init(_ dto: MemberDTO) {
        self.init(id: dto.id, orgId: dto.orgId, userId: dto.userId, displayName: dto.displayName,
                  role: Role(rawValue: dto.role) ?? .crew,
                  preferredLanguage: AppLanguage(rawValue: dto.preferredLanguage) ?? .en, now: dto.createdAt)
        apply(dto)
    }

    func apply(_ dto: MemberDTO) {
        displayName = dto.displayName
        roleRaw = dto.role
        phone = dto.phone
        preferredLanguageRaw = dto.preferredLanguage
        updatedAt = dto.updatedAt
        serverUpdatedAt = dto.serverUpdatedAt
        deletedAt = dto.deletedAt
        needsSync = false
    }
}
