import SwiftUI

struct ClientEditorRequest: Identifiable {
    let id = UUID()
    var client: Client?
}

struct ClientEditor: View {
    @Environment(Workspace.self) private var workspace
    @Environment(\.dismiss) private var dismiss
    let request: ClientEditorRequest
    @State private var draft: ClientDraft
    @State private var original: ClientDraft
    @State private var saveFailed = false

    init(request: ClientEditorRequest) {
        self.request = request
        let start = request.client.map(ClientDraft.init) ?? ClientDraft()
        _draft = State(initialValue: start)
        _original = State(initialValue: start)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: .clientFieldName), text: $draft.name)
                        .textContentType(.name)
                    TextField(String(localized: .clientFieldPhone), text: $draft.phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                    TextField(String(localized: .clientFieldEmail), text: $draft.email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField(String(localized: .clientFieldAddress), text: $draft.address, axis: .vertical)
                        .textContentType(.fullStreetAddress)
                } header: {
                    Text(.clientSectionContact)
                } footer: {
                    if !draft.isEmailValid { Text(.clientErrorEmail).foregroundStyle(.red) }
                }
                Section {
                    Picker(selection: $draft.preferredLanguage) {
                        ForEach(AppLanguage.allCases, id: \.self) { Text($0.title).tag($0) }
                    } label: {
                        Text(.clientFieldLanguage)
                    }
                    Picker(selection: $draft.smsConsent) {
                        ForEach([Client.SMSConsent.unknown, .granted, .revoked], id: \.self) { Text($0.title).tag($0) }
                    } label: {
                        Text(.clientFieldSmsConsent)
                    }
                    Toggle(isOn: $draft.isSenior65Plus) { Text(.clientFieldSenior) }
                } header: {
                    Text(.clientSectionDetails)
                } footer: {
                    Text(.clientFieldSeniorHint)
                }
                Section {
                    TextField(String(localized: .clientFieldNotes), text: $draft.notes, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle(Text(request.client == nil ? .clientsNew : .clientsEdit))
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
            try workspace.save(draft, to: request.client)
            dismiss()
        } catch {
            saveFailed = true
        }
    }
}
