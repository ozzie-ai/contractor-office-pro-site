# Contractor Office Pro: one product, shared services, multiple viable clients

**Integration audit — 2026-11-16.** Working branch: `integration/expo-fastapi-supabase-unified-20261115` (GitHub draft PR #46). This is the recorded technical reconciliation of existing work, not an announcement that the products are already merged or live.

## What we actually have

| Component | Original location | Current value | Integration state |
|---|---|---|---|
| Expo / React Native | `mobile/` | Bilingual practical contractor workflow, photos, saved local drafts, scope, editable quantities/prices, customer PDF. This is the version the user has personally tested by installing an Xcode dev build on an iPhone. Expo can target Android as well. | **Retain without replacing.** The cloud bridge is written but not yet authenticated on that device. |
| Derek's native Swift / SwiftUI | `ios/` imported verbatim from `integration/electrical-acceptance-20261113` | SwiftData job/client models, offline sync engine, Supabase auth, Apple on-device speech recognizer, estimation API client, approval-gated PDF, test code. Bundle ID in native project differs from Expo app. | **Preserved for structured evaluation and reuse**, not automatically the user's installed app, not confirmed App Store deployed or code-signed. No SwiftUI-over-Expo replacement. |
| Shared FastAPI Python backend | `backend/` | Authenticated scoped pricing, pricebook, interpretation endpoints. Docker deployment. | Code integrated into #46; Render Free deployment **currently confirmed at commit `173238e`**, which is older than this branch's `/v1/account/bootstrap` route; must redeploy after parity tests. |
| Cloud database | Supabase project `xhbbshryjdcotvwuslxd` | 12 app tables, RLS, auth, private media bucket and two applied migration records. | **Development DB active.** No confirmed live real-person onboarding or cross-client synchronization yet. |
| Residential pricing | Local SQLite / reviewed export `database/` | Reference datasets and a safety-gated exporter. At last review, no approved final retail unit-selling rates. | **Not yet** fully linked to Supabase pricebook or across-all-trades pricing. Never call scenario/example rates verified selling prices. |
| Web prototype | GitHub Pages `index.html` | Historical v44 estimate prototype | **Legacy comparison only.** Not a screenshot or current build of mobile app. |
| Apple developer / Derek's paid Apple arrangement | Outside GitHub | May facilitate native signing, TestFlight or App Store distribution | **Do not assume** subscription credentials, published app, or deployed status from `ios/` code. Check actual signing/distribution when deciding release. |

## Product architecture: share work, not a second disconnected app

```
   Mobile experience under active testing: Expo (iPhone now, Android possible)
                 |                     |
     Native Swift feature source     Offline drafts/photos
     preserved for evaluation             |
                 |                     |
                 +---- shared authenticated API ----+
                                |
                            FastAPI on Render
                           /               \
                Supabase Auth + RLS      Pricing engine
                        |                      |
                Business clients/jobs   Reviewed cost data
                estimates/pricebook      contractor approval
```

The backend is client-agnostic. **A single trustworthy pricing and account domain is the goal**, not making Swift and Expo share one UI runtime. The team should identify features worth porting or reusing (especially Swift's sync and on-device speech) without discarding the existing Expo flow or assuming Apple is the only platform. Do not point the mobile app at an obsolete static website for testing.

## Specific gaps that must be resolved, in dependency order

1. **Auth decision and business ownership.** Expo's prototype uses email OTP and a server-mediated first-business bootstrap; Derek's Swift prototype defaults to anonymous Supabase sign-in and may use direct RPC business setup. These do not automatically yield the same user ID or organization. No silent account merging or cross-client data upload.
2. **Shared API parity.** Both clients contain typed interfaces for `POST /v1/interpret`, `POST /v1/estimate/price` and `GET/POST /v1/pricebook`. Verify schemas from live FastAPI OpenAPI, price rounding, error statuses, contractor approval and source classifications against both clients; do not equate matching route names with a successful end-to-end integration.
3. **Keep offline work.** Expo drafts/photos are local files; Swift models live in SwiftData and have a more complete push/pull engine. They are different data stores. Adopt a tested sync mapping rather than deleting local drafts, requiring new signup, or silently overwriting on another device.
4. **Voice capture.** Expo current stable capture relies on iOS keyboard microphone while a native speech crash is investigated; Swift has an on-device Speech/AVFoundation recorder. Evaluate portability, permissions, bilingual quality and reliability. Do not assume Swift code can be pasted into React Native.
5. **Price coverage and PDF safety.** Keep the deterministic backend pricing rules, source/evidence review and internal/private separation. Neither example price allowances nor unmatched master SQLite records should silently become final sell prices. Test full scope, exclusions, quantities, internal costs and customer-only PDF.
6. **Version/deployment truth.** Render's first live deploy was `173238e`, but PR #46 has newer changes. GitHub code, Render server, actual Xcode dev build, and any native Swift app are different release artifacts. Report commit/version for each; redeploy latest backend and reload actual phone app before saying live integration works.
7. **Apple distribution is not hosting.** A paid Apple developer account or TestFlight build may handle signed iOS distribution; Render/Supabase provide the backend and cloud data. Neither proves the other is deployed. Keep zero-dollar hosting and no unapproved API charges.

## Do not break what already works

- Do not replace the user's installed Expo app, remove an app on the phone, clear its saved photos/drafts, or use `git reset --hard`.
- Preserve both `mobile/` and `ios/` as source until feature parity is assessed. The native Swift app is a separate candidate, not automatically selected for release.
- Keep all server/API secrets off phone bundles; publishable Supabase keys alone are public.
- Do not merge this draft integration into `main` or switch production backend version solely because code compiles.
- Avoid double-work on several simultaneous chat branches; PR #46 is the unified *integration workstream*, while published mobile and backend versions are reported separately.

## Acceptance gates

**Gate A — Inventory (this commit):** Both client source trees and shared backend included in one integration branch, with code ownership and differences explicitly documented.

**Gate B — Contract/identity:** Tests prove authenticated business isolation, the same deterministic price input/output invariants, and safe login/first-business onboarding. Native Swift must compile and pass its own unit tests on Apple toolchain; Expo must pass its JS/iOS tests.

**Gate C — Real device:** Existing iPhone Xcode dev build loads integration, preserves old data/photos, completes estimate/PDF, verifies real Supabase account and Render price check. If a Swift build is considered, test it separately without replacing the installed Expo data.

**Gate D — Product:** Tested cross-platform work where applicable, cloud job/photo sync, broad residential pricing approvals, operational monitoring and cost controls. Only then choose a release client/distribution plan. 
