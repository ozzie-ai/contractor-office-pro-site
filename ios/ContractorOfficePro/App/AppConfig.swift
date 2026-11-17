import Foundation

/// Reads non-secret client config injected from xcconfig → Info.plist.
nonisolated enum AppConfig {
    static var supabaseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SupabaseURL") as? String,
              !raw.isEmpty else { return nil }
        return URL(string: raw)
    }

    static var supabaseAnonKey: String? {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SupabaseAnonKey") as? String,
              !key.isEmpty else { return nil }
        return key
    }

    /// Authenticated API base URL; never contains OpenAI or service-role keys.
    static var estimatingAPIURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "EstimatingAPIURL") as? String,
              let url = URL(string: raw), url.scheme?.lowercased() == "https",
              url.host != nil else { return nil }
        return url
    }

    static var isBackendConfigured: Bool { supabaseURL != nil && supabaseAnonKey != nil }
}
