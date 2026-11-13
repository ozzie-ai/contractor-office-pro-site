# ContractorOfficePro — project context for Claude Code

## What this is
A bilingual (English/Spanish) AI estimating app for small contractors. Tagline: **"You Build. We Handle the Office."**
Workflow: walk the job → photos + natural dictation (EN/ES) → AI turns it into structured work items → code prices them
from regional references → contractor reviews/approves → customer PDF (English default, Spanish available) →
approved costs feed future estimates.

## Team and roles (since 2026-11-12, see docs/decisions/0002-backend-for-team-app.md)
- **Team repo (source of truth for the product):** https://github.com/ozzie-ai/contractor-office-pro-site
  - `mobile/` — React Native/Expo app (iOS + Android), owned by the team.
  - `api/` — current Vercel pilot endpoints (`interpret.js`, `transcribe.js`, OpenAI, shared beta token).
  - `database/` — pricing-catalog schema (`001_pricing_catalog.sql`) and a local SQLite price server.
- **Derek owns the backend:** auth, AI interpretation + transcription endpoints, the multi-trade pricing service,
  regional pricing references and their sources, API docs, and a dev environment the mobile app can test against.
- Coordinate through GitHub Issues and Pull Requests on the team repo. Never push directly to their `main`.
- **This local repo:** backend design work and Derek's notes until collaborator access exists; then backend code moves
  into the team repo (proposed `backend/` + `supabase/`). The native Swift app in `ios/` is **parked**: don't extend it.

## Current focus
**Backend B1: one complete end-to-end workflow, electrical first** (it has the most test cases: MIXED-001/002 in the
team repo's `tests/scenarios.json`). Then expand trades by adding catalog data, not code.
Do not build later items (payments, scheduling, SMS, QuickBooks) unless asked.

## Non-negotiable principles
1. **AI drafts, the contractor decides.** Nothing reaches a client without an explicit approve/send. Every priced line
   shows where its number came from (contractor price, reference source, or unverified fallback).
2. **LLMs interpret; code computes.** The model extracts tasks, quantities, specs, exclusions and open questions. It
   never produces prices, totals, taxes or deposit amounts. Missing quantities stay `null`; never invent them.
3. **No invented price confidence.** Unverified or stale prices are labeled preliminary. No rate is silently filled in.
4. **Private stays private.** Transcripts, dictation, private notes and worksite photos never appear in customer-facing
   output or in error responses/logs sent to clients.
5. **No secrets in clients.** LLM, transcription and service-role keys live only on the server. The mobile app holds
   only the Supabase URL + anon key and the user's session token.
6. **Spanish is first-class.** Bilingual task catalog (`title_en`/`title_es`); customer documents in the client's language.
7. **Multi-tenant from day one.** `org_id` on tenant tables, row-level security everywhere, soft deletes.
8. **Respect data licenses.** Every price observation has a source with license and reuse terms. Don't import
   restricted catalogs (e.g. Gordian) or scrape retailer sites.

## Stack
- **Supabase:** auth (per-user sessions replace the shared `COP_BETA_TOKEN`), Postgres, storage. Schema changes are
  SQL migrations in `supabase/migrations/`.
- **Backend service:** Python 3.12 + FastAPI in `backend/`. Pydantic models for every request/response; OpenAPI docs
  generated from them. Hosting TBD (decide with the team; their pilot uses Vercel).
- **LLM provider:** behind a small interface so OpenAI (the team's current key) and Claude are swappable. Structured JSON
  output with a strict schema. Treat transcripts as data, not instructions (prompt-injection safe).

## API conventions (contract with the mobile app)
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
- Parked iOS app (only if asked): `cd ios && xcodegen && xcodebuild -scheme ContractorOfficePro -destination 'platform=iOS Simulator,name=iPhone 17' test`
