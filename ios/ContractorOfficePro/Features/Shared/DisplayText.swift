import SwiftUI

extension Job.Status {
    var title: LocalizedStringResource {
        switch self {
        case .lead: .jobStatusLead
        case .estimating: .jobStatusEstimating
        case .scheduled: .jobStatusScheduled
        case .inProgress: .jobStatusInProgress
        case .completed: .jobStatusCompleted
        case .cancelled: .jobStatusCancelled
        }
    }

    var systemImage: String {
        switch self {
        case .lead: "sparkles"
        case .estimating: "doc.text"
        case .scheduled: "calendar"
        case .inProgress: "hammer"
        case .completed: "checkmark.circle"
        case .cancelled: "xmark.circle"
        }
    }

    var tint: Color {
        switch self {
        case .lead: .purple
        case .estimating: .orange
        case .scheduled: .blue
        case .inProgress: .green
        case .completed: .secondary
        case .cancelled: .secondary
        }
    }
}

extension Client.SMSConsent {
    var title: LocalizedStringResource {
        switch self {
        case .unknown: .clientSmsUnknown
        case .granted: .clientSmsGranted
        case .revoked: .clientSmsRevoked
        }
    }
}

extension AppLanguage {
    var title: LocalizedStringResource {
        switch self {
        case .en: .languageEn
        case .es: .languageEs
        }
    }
}

extension JobFilter {
    var title: LocalizedStringResource {
        switch self {
        case .active: .jobsFilterActive
        case .done: .jobsFilterDone
        }
    }
}

/// A status capsule used in rows and headers.
struct StatusBadge: View {
    let status: Job.Status

    var body: some View {
        Label { Text(status.title) } icon: { Image(systemName: status.systemImage) }
            .font(.caption.weight(.medium))
            .foregroundStyle(status.tint)
    }
}

/// Labeled read-only row that hides itself when there's no value.
struct InfoRow: View {
    let label: LocalizedStringResource
    let value: String?

    var body: some View {
        if let value, !value.isEmpty {
            LabeledContent { Text(value).multilineTextAlignment(.trailing) } label: { Text(label) }
        }
    }
}

/// Cancel / Save toolbar shared by editor sheets.
struct EditorToolbar: ToolbarContent {
    let canSave: Bool
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(action: onCancel) { Text(.commonCancel) }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button(action: onSave) { Text(.commonSave) }
                .disabled(!canSave)
        }
    }
}

enum ContactLinks {
    static func phone(_ number: String?) -> URL? { digits(number).flatMap { URL(string: "tel:\($0)") } }
    static func sms(_ number: String?) -> URL? { digits(number).flatMap { URL(string: "sms:\($0)") } }
    static func email(_ address: String?) -> URL? { address?.nilIfBlank.flatMap { URL(string: "mailto:\($0)") } }
    static func maps(_ address: String?) -> URL? {
        guard let query = address?.nilIfBlank?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }
        return URL(string: "maps://?q=\(query)")
    }

    private static func digits(_ number: String?) -> String? {
        let value = (number ?? "").filter { $0.isNumber || $0 == "+" }
        return value.isEmpty ? nil : value
    }
}
