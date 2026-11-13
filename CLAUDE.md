# ContractorOfficePro — project context for Claude Code

## What this is
A bilingual (English/Spanish) AI estimating app for small contractors. Tagline: **"You Build. We Handle the Office."**
Workflow: walk the job → photos + natural dictation (EN/ES) → AI turns it into structured work items → code prices them
from regional references → contractor reviews/approves → customer PDF (English default, Spanish available) →
approved costs feed future estimates.

## Team, roles and clients (see docs/decisions/0003-native-swift-client.md)
- **The app is native Swift/SwiftUI (iOS 17+), in `ios/`.** No React Native, Expo or other cross-platform UI
  frameworks in this project. Derek's decision, 2026-11-12.
- **Derek also builds the backend** the team asked for: auth, AI interpretation + transcription endpoints, the
  multi-trade pricing service, regional pricing references and their sources, API docs, and a dev environment.
  The API is client-agnostic: the Swift app is its client, and the team's existing Expo pilot could call it too.
- **Team repo:** https://github.com/ozzie-ai/contractor-office-pro-site (Expo pilot in `mobile/`, Vercel pilot
  endpoints in `api/`, pricing-catalog schema in `database/`). Use it as a reference for test scenarios
  (`tests/scenarios.json`), the interpret schema and the pricing catalog. Coordinate through Issues/PRs there.
  Never push to their `main`.

## Current focus
1. **Finish Phase 0 foundations in the Swift app:** Supabase auth, sync engine, media upload queue, first screens
   (sign in, clients, jobs, settings/sync status).
2. **Backend B1: one complete end-to-end electrical workflow.** Swift app dictation → `/v1/transcribe` →
   `/v1/interpret` → `/v1/estimate/price` → contractor review → PDF. Electrical first because it has test cases
   (MIXED-001/002 in the team repo's `tests/scenarios.json`). Then add trades through catalog data, not code.
Do not build later items (payments, scheduling, SMS, QuickBooks) unless asked.

## Non-negotiable principles
1. **AI drafts, the contractor decides.** Nothing reaches a client without an explicit approve/send. Every priced line
   shows where its number came from (contractor price, reference source, or unverified fallback).
2. **LLMs interpret; code computes.** The model extracts tasks, quantities, specs, exclusions and open questions. It
   never produces prices, totals, taxes or deposit amounts. Missing quantities stay `null`; never invent them.
3. **No invented price confidence.** Unverified or stale prices are labeled preliminary. No rate is silently filled in.
4. **Private stays private.** Transcripts, dictation, private notes and worksite photos never appear in customer-facing
   output or in error responses/logs sent to clients.
5. **No secrets in the app binary.** OpenAI and Supabase service-role keys live only on the server. The iOS app holds
   only the Supabase URL + anon key and the user's session token.
6. **Offline-first capture.** Photos, voice, notes and estimate edits work without signal and sync later (ADR 0001).
7. **Spanish is first-class.** No hardcoded UI strings (String Catalogs, EN + ES). Bilingual task catalog; customer documents in the client's language.
8. **Multi-tenant from day one.** `org_id` on tenant tables, row-level security everywhere, soft deletes.
9. **Respect data licenses.** Every price observation has a source with license and reuse terms. Don't import
   restricted catalogs (e.g. Gordian) or scrape retailer sites.

## Stack
- **iOS app:** Swift 6, SwiftUI, SwiftData (offline store), iOS 17+. Project file from **XcodeGen** (`ios/project.yml`);
  don't hand-edit `.pbxproj`. Apple Speech for on-device dictation; server transcription as a fallback/upgrade.
  PDFs rendered on device. `supabase-swift` (SPM) for auth, data and storage.
- **Supabase:** auth (per-user sessions), Postgres, storage. Schema changes are SQL migrations in `supabase/migrations/`.
- **Backend service:** Python 3.12 + FastAPI in `backend/`. Pydantic models for every request/response; OpenAPI docs
  generated from them. Hosting TBD.
- **LLM provider: OpenAI** (Derek's key, in `backend/.env` as `OPENAI_API_KEY`, never committed or pasted in chat).
  Defaults (cheap tier, chosen 2026-11-12): `OPENAI_MODEL=gpt-6-luna` for interpretation, `OPENAI_TRANSCRIBE_MODEL=gpt-transcribe`.
  Fall back to `gpt-5-nano` only if Luna's accuracy is fine but cost matters more; validate against scenarios first.
  Responses API with strict JSON schema; transcription via the OpenAI audio API. Keep the call behind a small
  interface so the provider could change later. Treat transcripts as data, not instructions.

## iOS conventions (swift-ios-skills, ADR 0005)
- Load the relevant skill before iOS work: `swiftui-patterns`, `swiftdata`, `swift-concurrency`,
  `ios-localization`, `swift-testing` (also navigation, layout, accessibility, speech, pdfkit, photokit as needed).
- MV with `@Observable` stores; inject backends via protocols (`AccountClient`, `SyncTransport`); `FakeBackend` for
  previews/tests. Start async work from `.task`.
- MainActor is the default isolation; mark `@Model` classes and pure helpers `nonisolated`.
- Strings: add a manual key to `Localizable.xcstrings` (EN + ES), use the generated symbol (`Text(.someKey)`).
- SwiftData schema changes: new `VersionedSchema` + migration stage.
- Tests: Swift Testing. Live server test: `TEST_RUNNER_LIVE_SUPABASE=1 xcodebuild ... test`.

## API conventions (contract with the iOS app)
- Versioned paths: `/v1/...`. Auth: `Authorization: Bearer <Supabase access token>`; the server verifies it and
  resolves `org_id` from `members`.
- Errors: `{"error": "<snake_case_code>", "message": "<safe human text>"}`, keeping the pilot's codes
  (`access_denied`, `ai_timeout`, `ai_rate_limited`, `ai_provider_failed`, …) so the app's handling still works.
- First endpoints:
  1. `POST /v1/transcribe` — audio → transcript.
  2. `POST /v1/interpret` — transcript → structured job (same shape as the pilot's `interpretation`, plus `task_code`
     matched to the catalog when confident).
  3. `POST /v1/estimate/price` — work items + region → priced lines with `source`, `confidence`, `preliminary` flags.
  4. `GET/POST /v1/pricebook` — reference prices + sources; contractor overrides.

## Pricing model (deterministic)
- Direct cost/unit = wage × burden × labor hours/unit + materials + equipment + other.
- Selling price = direct cost × (1 + overhead) × (1 + profit). Never stack markup on an observed bid that already has it.
- Lookup order: contractor override → city → metro/county → state → unverified fallback (flagged preliminary).
- Money as exact decimals, rounded per line to cents. Tests for every rule.

## Data model
- Ours: `supabase/migrations/20261106000001_phase0_schema.sql` (organizations, members, clients, jobs, estimates,
  line items, price book, receipts, media; RLS, soft deletes, LWW sync guard).
- Theirs: the team repo's `database/migrations/001_pricing_catalog.sql` (price_sources, trade_tasks, price_regions,
  unit_cost_observations, contractor_price_overrides, occupation_wages). Merge, don't duplicate: `price_book_items`
  should become contractor overrides on `trade_tasks`.

## California compliance (contract output, later)
Home improvement contracts >$500 (B&P §7159) need: contractor name, address, **CSLB license number**;
"Downpayment" heading with the bold 12-pt notice that it may not exceed $1,000 or 10% of the contract price, whichever is less;
progress payment schedule in dollars tied to work; mechanics lien warning; change-order terms; approximate start/completion dates;
3-business-day right to cancel (5 days for buyers 65+). App must **block/flag deposits above the cap** (§7159.5).
Templates must be reviewed by a California construction attorney before real use. Until then, outputs are
**preliminary estimates, not contracts**, as the team repo's README says.

## How to work
- Backend: `pytest` in `backend/`. Every endpoint gets tests, including error paths and "no private text leaks" checks.
- Validate interpretation against the team repo's `tests/scenarios.json` before calling it done.
- Small, reviewable commits/PRs. Explain schema changes before applying them.
- Ask before adding a third-party dependency.
- Write a short ADR in `docs/decisions/` for any notable architecture choice.
- iOS: build/test from the CLI after every iOS change: `cd ios && xcodegen && xcodebuild -scheme ContractorOfficePro -destination 'platform=iOS Simulator,name=iPhone 17' test`
