import Foundation

/// Editors work on a value copy, so Cancel discards and Save applies everything at once.

struct ClientDraft: Equatable {
    var name = ""
    var phone = ""
    var email = ""
    var address = ""
    var preferredLanguage: AppLanguage = .en
    var smsConsent: Client.SMSConsent = .unknown
    var isSenior65Plus = false
    var notes = ""

    init() {}

    init(_ client: Client) {
        name = client.name
        phone = client.phone ?? ""
        email = client.email ?? ""
        address = client.address ?? ""
        preferredLanguage = client.preferredLanguage
        smsConsent = client.smsConsent
        isSenior65Plus = client.isSenior65Plus
        notes = client.notes ?? ""
    }

    var isEmailValid: Bool {
        let value = email.trimmed
        return value.isEmpty || (value.contains("@") && value.contains(".") && !value.contains(" "))
    }

    var isValid: Bool { !name.trimmed.isEmpty && isEmailValid }

    func apply(to client: Client, now: Date = .now) {
        client.name = name.trimmed
        client.phone = phone.nilIfBlank
        client.email = email.trimmed.lowercased().nilIfBlank
        client.address = address.nilIfBlank
        client.preferredLanguage = preferredLanguage
        if client.smsConsent != smsConsent {
            client.smsConsent = smsConsent
            client.smsConsentAt = now
        }
        client.isSenior65Plus = isSenior65Plus
        client.notes = notes.nilIfBlank
    }
}

struct JobDraft: Equatable {
    var title = ""
    var clientID: UUID?
    var address = ""
    var status: Job.Status = .lead
    var hasSchedule = false
    var start: Date
    var end: Date
    var notes = ""

    init(clientID: UUID? = nil, address: String? = nil, now: Date = .now) {
        self.clientID = clientID
        self.address = address ?? ""
        let start = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 8), matchingPolicy: .nextTime) ?? now
        self.start = start
        self.end = start.addingTimeInterval(8 * 3600)
    }

    init(_ job: Job) {
        title = job.title
        clientID = job.clientId
        address = job.address ?? ""
        status = job.status
        hasSchedule = job.scheduledStart != nil
        start = job.scheduledStart ?? .now
        end = job.scheduledEnd ?? (job.scheduledStart ?? .now).addingTimeInterval(8 * 3600)
        notes = job.notes ?? ""
    }

    var isScheduleValid: Bool { !hasSchedule || end >= start }
    var isValid: Bool { !title.trimmed.isEmpty && isScheduleValid }

    func apply(to job: Job) {
        job.title = title.trimmed
        job.clientId = clientID
        job.address = address.nilIfBlank
        job.status = status
        job.scheduledStart = hasSchedule ? start : nil
        job.scheduledEnd = hasSchedule ? end : nil
        job.notes = notes.nilIfBlank
    }
}

struct OrganizationDraft: Equatable {
    var name = ""
    var cslbLicense = ""
    var address = ""
    var phone = ""
    var email = ""
    var defaultLanguage: AppLanguage = .en
    /// Typed as a percent ("7.25", or "7,25" in Spanish), stored as a fraction (0.0725).
    var taxPercentText = ""

    init(_ org: Organization) {
        name = org.name
        cslbLicense = org.cslbLicense ?? ""
        address = org.address ?? ""
        phone = org.phone ?? ""
        email = org.email ?? ""
        defaultLanguage = org.defaultLanguage
        taxPercentText = (org.taxRate * 100).formatted(.number.precision(.fractionLength(0...3)).grouping(.never))
    }

    /// Parsed tax as a fraction, nil if it isn't a number between 0 and 25 percent.
    var taxRate: Decimal? {
        let text = taxPercentText.trimmed.replacingOccurrences(of: "%", with: "")
        guard !text.isEmpty else { return 0 }
        // Accept "7.25" and "7,25" whatever the phone's locale: tax rates never need thousands separators.
        let candidates = [Decimal(string: text.replacingOccurrences(of: ",", with: ".")),
                          try? Decimal(text, format: .number)]
        guard let percent = candidates.compactMap({ $0 }).first(where: { $0 >= 0 && $0 <= 25 }) else { return nil }
        return EstimateCalculator.round(percent / 100, places: 5)
    }

    var isValid: Bool { !name.trimmed.isEmpty && taxRate != nil }

    func apply(to org: Organization) {
        org.name = name.trimmed
        org.cslbLicense = cslbLicense.nilIfBlank
        org.address = address.nilIfBlank
        org.phone = phone.nilIfBlank
        org.email = email.trimmed.lowercased().nilIfBlank
        org.defaultLanguage = defaultLanguage
        if let taxRate { org.taxRate = taxRate }
    }
}

nonisolated extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfBlank: String? { trimmed.isEmpty ? nil : trimmed }
}
