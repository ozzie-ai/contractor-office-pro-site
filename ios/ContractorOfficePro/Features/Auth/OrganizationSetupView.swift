import SwiftUI

struct OrganizationSetupView: View {
    @Environment(SessionStore.self) private var session
    @State private var businessName = ""
    @State private var ownerName = ""
    @State private var language: AppLanguage = Locale.current.language.languageCode == .spanish ? .es : .en
    @State private var isWorking = false
    @State private var failure: SessionStore.Failure?

    private var canContinue: Bool {
        !isWorking && !businessName.trimmingCharacters(in: .whitespaces).isEmpty
            && !ownerName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        Form {
            Section {
                Text(.orgSetupTitle).font(.title2.bold())
                Text(.orgSetupSubtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                TextField(String(localized: .orgSetupBusinessName), text: $businessName)
                    .textContentType(.organizationName)
                TextField(String(localized: .orgSetupYourName), text: $ownerName)
                    .textContentType(.name)
                Picker(selection: $language) {
                    Text(.languageEn).tag(AppLanguage.en)
                    Text(.languageEs).tag(AppLanguage.es)
                } label: {
                    Text(.orgSetupLanguage)
                }
            }
            if let failure {
                Section { Text(failure.message).foregroundStyle(.red) }
            }
            Section {
                Button(action: submit) {
                    HStack {
                        Text(.orgSetupContinue)
                        if isWorking { Spacer(); ProgressView() }
                    }
                }
                .disabled(!canContinue)
            }
        }
    }

    private func submit() {
        isWorking = true
        failure = nil
        Task {
            defer { isWorking = false }
            do {
                try await session.createOrganization(name: businessName, ownerName: ownerName, language: language)
            } catch {
                failure = error as? SessionStore.Failure ?? .organizationSetup
            }
        }
    }
}

#Preview {
    let (container, session) = PreviewData.firstLaunch()
    return RootView().environment(session).modelContainer(container)
}
