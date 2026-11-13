import Foundation
import Supabase

/// The one Supabase client. Holds only the publishable/anon key (CLAUDE.md principle 5).
enum Backend {
    static let client: SupabaseClient? = {
        guard let url = AppConfig.supabaseURL, let key = AppConfig.supabaseAnonKey else { return nil }
        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(auth: .init(emitLocalSessionAsInitialSession: true))
        )
    }()
}
