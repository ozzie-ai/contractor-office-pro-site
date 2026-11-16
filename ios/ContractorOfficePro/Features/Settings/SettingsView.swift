import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(Workspace.self) private var workspace
    @Query private var organizations: [Organization]
    @State private var editingBusiness = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    var body: some View {
        Form {
            if let org = organizations.first(where: { $0.id == workspace.orgID }) {
                Section {
                    LabeledContent { Text(org.name) } label: { Text(.businessFieldName) }
                    LabeledContent {
                        Text(org.cslbLicense ?? String(localized: .businessNotSet))
                            .foregroundStyle(org.cslbLicense == nil ? .orange : .primary)
                    } label: {
                        Text(.businessFieldCslb)
                    }
                    InfoRow(label: .businessFieldPhone, value: org.phone)
                    InfoRow(label: .businessFieldEmail, value: org.email)
                    InfoRow(label: .businessFieldAddress, value: org.address)
                    LabeledContent {
                        Text(org.taxRate, format: .percent.precision(.fractionLength(0...3)))
                    } label: {
                        Text(.businessFieldTax)
                    }
                    LabeledContent { Text(org.defaultLanguage.title) } label: { Text(.businessFieldLanguage) }
                    Button { editingBusiness = true } label: { Text(.settingsEditBusiness) }
                } header: {
                    Text(.settingsSectionBusiness)
                }
                .sheet(isPresented: $editingBusiness) { BusinessEditor(organization: org) }
            }
            Section {
                SyncStatusView(sync: workspace.sync)
                Button {
                    Task { await workspace.sync.syncNow() }
                } label: {
                    Label { Text(.settingsSyncNow) } icon: { Image(systemName: "arrow.triangle.2.circlepath") }
                }
                .disabled(workspace.sync.status == .syncing)
            } header: {
                Text(.settingsSectionSync)
            }
            Section {
                LabeledContent { Text(.settingsAccountAnonymous) } label: { Text(.settingsAccount) }
                LabeledContent { Text(verbatim: version) } label: { Text(.settingsVersion) }
            } header: {
                Text(.settingsSectionAbout)
            }
        }
        .navigationTitle(Text(.settingsTitle))
    }
}

struct BusinessEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let organization: Organization
    @State private var draft: OrganizationDraft
    @State private var original: OrganizationDraft
    @State private var saveFailed = false

    init(organization: Organization) {
        self.organization = organization
        let start = OrganizationDraft(organization)
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: .businessFieldName), text: $draft.name)
                        .textContentType(.organizationName)
                    TextField(String(localized: .businessFieldCslb), text: $draft.cslbLicense)
                        .keyboardType(.numberPad)
                } footer: {
                    Text(.businessCslbHint)
                }
                Section {
                    TextField(String(localized: .businessFieldPhone), text: $draft.phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                    TextField(String(localized: .businessFieldEmail), text: $draft.email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField(String(localized: .businessFieldAddress), text: $draft.address, axis: .vertical)
                        .textContentType(.fullStreetAddress)
                }
                Section {
                    TextField(String(localized: .businessFieldTax), text: $draft.taxPercentText)
                        .keyboardType(.decimalPad)
                    Picker(selection: $draft.defaultLanguage) {
                        ForEach(AppLanguage.allCases, id: \.self) { Text($0.title).tag($0) }
                    } label: {
                        Text(.businessFieldLanguage)
                    }
                } footer: {
                    if draft.taxRate == nil { Text(.businessErrorTax).foregroundStyle(.red) }
                }
            }
            .navigationTitle(Text(.businessEdit))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                EditorToolbar(canSave: draft.isValid && draft != original, onCancel: { dismiss() }, onSave: save)
            }
            .interactiveDismissDisabled(draft != original)
            .alert(Text(.errorSaveFailed), isPresented: $saveFailed) {}
        }
    }

    private func save() {
        do {
            try workspace.save(draft, to: organization)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}

struct SyncStatusView: View {
    let sync: SyncEngine

    var body: some View {
        VStack(alignment: .leading) {
            statusLabel
            if sync.pendingCount > 0 {
                Text(.syncPending(count: sync.pendingCount))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch sync.status {
        case .syncing:
            Label { Text(.syncStatusSyncing) } icon: { Image(systemName: "arrow.triangle.2.circlepath") }
        case .offline:
            Label { Text(.syncStatusOffline) } icon: { Image(systemName: "wifi.slash") }
        case .failed:
            Label { Text(.syncStatusFailed) } icon: { Image(systemName: "exclamationmark.triangle") }
                .foregroundStyle(.orange)
        case .idle:
            if let last = sync.lastSyncedAt {
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    Label {
                        Text(.syncStatusSynced(time: last.formatted(.relative(presentation: .named))))
                    } icon: {
                        Image(systemName: "checkmark.icloud")
                    }
                }
            } else {
                Label { Text(.syncStatusNever) } icon: { Image(systemName: "icloud") }
            }
        }
    }
}

#Preview {
    let (container, session) = PreviewData.ready(withSamples: true)
    return RootView().environment(session).modelContainer(container)
}
