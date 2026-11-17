# Native Swift client — preserved from Derek's existing work

This complete `ios/` source tree was copied **unaltered** from `integration/electrical-acceptance-20261113` into the unified development branch on November 16, 2026. It preserves the independent Swift/SwiftUI/SwiftData client, on-device speech recorder, Supabase sync engine, authenticated estimating API bridge, approval-gated PDF, and native tests.

This is **not** the Expo/React Native app currently installed and tested on the user's iPhone. Its XcodeGen project (`project.yml`) has a different bundle ID; no native build/signing, TestFlight publication, and no Apple Developer subscription status were verified in this integration step. Do not install it over the user's existing Expo app.

The existing `Config/Base.xcconfig` reads an optional untracked `Config/Config.xcconfig`; `Config.example.xcconfig` documents public Supabase and HTTPS host values. Never add secret or service-role keys to client configuration.

Read [the one-product architecture audit](../docs/ONE_PRODUCT_INTEGRATION_AUDIT.md) and [ADR 0006](../docs/decisions/0006-unified-multiclient-product.md) before altering client architecture. Its anonymous-first auth and SwiftData sync are still different from the Expo app's email-code sign-in and file-based offline drafts. Real account, quote, sync, and iOS tests are pending.
