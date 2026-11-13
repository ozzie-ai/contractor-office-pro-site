import SwiftUI

struct OrganizationSetupView: View {
    @Environment(SessionStore.self) private var session
    @State private var businessName = ""
    @State private var ownerName = ""
    @State private var language: AppLanguage = Locale.current.language.languageCode?.identifier == "es" ? .es : .en
    @State private var working = false
    @State private var errorKey: String?

    var body: some View {
        Form {
            Section {
                Text("org.setup.title").font(.title2.bold())
                Text("org.setup.subtitle").font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                TextField("org.setup.business_name", text: $businessName)
                    .textContentType(.organizationName)
                TextField("org.setup.your_name", text: $ownerName)
                    .textContentType(.name)
                Picker("org.setup.language", selection: $language) {
                    Text("language.en").tag(AppLanguage.en)
                    Text("language.es").tag(AppLanguage.es)
                }
            }
            if let errorKey {
                Section { Text(LocalizedStringKey(errorKey)).foregroundStyle(.red) }
            }
            Section {
                Button(action: submit) {
                    HStack {
                        Text("org.setup.continue")
                        if working { Spacer(); ProgressView() }
                    }
                }
                .disabled(working || businessName.trimmingCharacters(in: .whitespaces).isEmpty
                          || ownerName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Section {
                Button("auth.sign_out", role: .destructive) { Task { await session.signOut() } }
            }
        }
    }

    private func submit() {
        working = true
        errorKey = nil
        Task {
            defer { working = false }
            do {
                try await session.createOrganization(name: businessName, ownerName: ownerName, language: language)
            } catch {
                errorKey = (error as? SessionStore.Failure ?? .network).rawValue
            }
        }
    }
}
