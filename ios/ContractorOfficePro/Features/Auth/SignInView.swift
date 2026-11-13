import SwiftUI

struct SignInView: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var working = false
    @State private var errorKey: String?

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Image(systemName: "hammer.fill").font(.largeTitle).foregroundStyle(.tint)
                    Text("auth.title").font(.title2.bold())
                    Text("auth.subtitle").font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section {
                TextField("auth.email.placeholder", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(codeSent)

                if codeSent {
                    TextField("auth.code.placeholder", text: $code)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                }
            } footer: {
                if codeSent { Text("auth.code.sent_hint") }
            }

            if let errorKey {
                Section { Text(LocalizedStringKey(errorKey)).foregroundStyle(.red) }
            }

            Section {
                Button(action: submit) {
                    HStack {
                        Text(codeSent ? "auth.code.verify" : "auth.email.send_code")
                        if working { Spacer(); ProgressView() }
                    }
                }
                .disabled(working || email.isEmpty || (codeSent && code.count < 6))

                if codeSent {
                    Button("auth.email.change") { codeSent = false; code = ""; errorKey = nil }
                        .disabled(working)
                }
            }
        }
    }

    private func submit() {
        working = true
        errorKey = nil
        Task {
            defer { working = false }
            do {
                if codeSent {
                    try await session.verify(email: email, code: code)
                } else {
                    try await session.sendCode(to: email)
                    codeSent = true
                }
            } catch {
                errorKey = (error as? SessionStore.Failure ?? .network).rawValue
            }
        }
    }
}
