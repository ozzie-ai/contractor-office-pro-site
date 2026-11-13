import SwiftUI

struct RootView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "hammer.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.tint)
                Text("home.welcome")
                    .font(.title2.bold())
                Text(AppConfig.isBackendConfigured ? "home.backend.configured" : "home.backend.missing")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle(Text("app.name"))
        }
    }
}

#Preview("English") { RootView() }
#Preview("Español") { RootView().environment(\.locale, Locale(identifier: "es")) }
