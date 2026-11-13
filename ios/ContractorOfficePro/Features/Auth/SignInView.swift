import SwiftUI

/// Email-code sign-in. Unused while dev mode signs in anonymously (ADR 0004); kept for when SMTP is set up.
struct SignInView: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var isWorking = false
    @State private var failure: SessionStore.Failure?

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading) {
                    Image(systemName: "hammer.fill").font(.largeTitle).foregroundStyle(.tint)
                        .accessibilityHidden(true)
                    Text(.authTitle).font(.title2.bold())
                    Text(.authSubtitle).font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }
            Section {
                TextField(String(localized: .authEmailPlaceholder), text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(codeSent)
                if codeSent {
                    TextField(String(localized: .authCodePlaceholder), text: $code)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                }
            } footer: {
                if codeSent { Text(.authCodeSentHint) }
            }
            if let failure {
                Section { Text(failure.message).foregroundStyle(.red) }
            }
            Section {
                Button(action: submit) {
                    HStack {
                        Text(codeSent ? .authCodeVerify : .authEmailSendCode)
                        if isWorking { Spacer(); ProgressView() }
                    }
                }
                .disabled(isWorking || email.isEmpty || (codeSent && code.count < 6))
                if codeSent {
                    Button { codeSent = false; code = ""; failure = nil } label: { Text(.authEmailChange) }
                        .disabled(isWorking)
                }
            }
        }
    }

    private func submit() {
        isWorking = true
        failure = nil
        Task {
            defer { isWorking = false }
            do {
                if codeSent {
                    try await session.verify(email: email, code: code)
                } else {
                    try await session.sendCode(to: email)
                    codeSent = true
                }
            } catch {
                failure = error as? SessionStore.Failure ?? .network
            }
        }
    }
}

#Preview {
    let (container, session) = PreviewData.firstLaunch()
    return SignInView().environment(session).modelContainer(container)
}
