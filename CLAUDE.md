# ContractorOfficePro — project context for Claude Code

## What this is
A bilingual (English/Spanish) iOS app that runs the office side of a small trades business from the truck:
voice + photo capture → AI-drafted estimates → contracts/invoices → payments, receipts, scheduling, client texting.
Built first for Derek's own solo general-contractor work in California; productized later only if it earns daily use.
Target user if productized: Spanish-speaking owner-operators (solo to 3 people), remodel/handyman first.

Full plan: `docs/ROADMAP.md`. Market/legal research: `docs/RESEARCH_SUMMARY.md`.

## Current phase
**Phase 0 — Foundations.** Do not build features from later phases unless asked.
Phase gate: a phase starts only after the previous one is used on real jobs for ~2 weeks.

## Non-negotiable principles
1. **AI drafts, the contractor decides.** No price, contract, schedule or message reaches a client without an explicit approve/send tap. Mark which line items came from AI vs. the price book.
2. **Offline-first.** Capture (photos, voice, notes, estimate edits) must work with no signal; sync later.
3. **Spanish is first-class.** No hardcoded user-facing strings — everything goes through String Catalogs (`Localizable.xcstrings`) with EN and ES. Client-facing PDFs/messages render in the client's `preferred_language`.
4. **Solo-first, dispatch-ready.** Every table has `org_id`. Jobs and calendar blocks have `assigned_to` (defaults to owner). A `members` table exists with one owner row.
5. **LLMs interpret; code computes.** Totals, taxes, deposit caps, routing (OR-Tools) are deterministic code, never LLM math.
6. **No secrets in the app binary.** LLM / transcription / Stripe secret calls go through the backend (Supabase Edge Functions or the FastAPI service). The iOS app only holds the Supabase anon key.
7. **Integrate, don't rebuild:** QuickBooks/Xero (accounting), Stripe (payments), Twilio (SMS, later).

## Stack
- iOS: Swift, SwiftUI, SwiftData (local store), iOS 17+. Apple Speech for on-device transcription, Vision for receipt OCR, EventKit, APNs.
- Project file: prefer **XcodeGen** (`project.yml`) so project config is plain text you can edit; don't hand-edit `.pbxproj`.
- Backend: Supabase (auth, Postgres, storage, sync). Schema changes as SQL migrations in `supabase/migrations/`. Row-level security on every table, scoped by `org_id`.
- Custom logic: Python 3.12 + FastAPI in `backend/` (LLM estimate drafting with Claude API structured JSON output, PDF generation, OR-Tools later).

## Suggested layout
```
ios/            XcodeGen project.yml, App/, Features/, Models/, Services/, Resources/Localizable.xcstrings
backend/        FastAPI service, tests/
supabase/       migrations/, functions/
docs/           ROADMAP.md, RESEARCH_SUMMARY.md, decisions/ (short ADRs)
```

## Core data model (Phase 0)
Organization, Member, Client (name, phone, email, address, preferred_language, sms_consent),
Job (client, address, status, assigned_to, clock entries), Estimate (status: draft/sent/accepted/declined, totals, language),
LineItem (estimate, description_en, description_es, qty, unit, unit_price, source: ai|price_book|manual),
PriceBookItem (labor rates, materials, markup), Expense, Receipt (store, date, total, line items, image),
ReceiptLineItem (sku?, description, qty, unit_price), Media (photo/voice, job, transcript), TimeEntry.
All have `id` (UUID), `org_id`, `created_at`, `updated_at`, and a sync-friendly `deleted_at`.

## California compliance (Phase 1 contract output)
Home improvement contracts >$500 (B&P §7159) need: contractor name, address, **CSLB license number**;
"Downpayment" heading with the bold 12-pt notice that it may not exceed $1,000 or 10% of the contract price, whichever is less;
progress payment schedule in dollars tied to work; mechanics lien warning; change-order terms; approximate start/completion dates;
3-business-day right to cancel (5 days for buyers 65+). App must **block/flag deposits above the cap** (§7159.5).
Templates must be reviewed by a California construction attorney before real use.

## How to work
- Build/test from the CLI so you can see errors: `xcodebuild -scheme ContractorOfficePro -destination 'platform=iOS Simulator,name=iPhone 16' build test`
- Backend: `pytest` in `backend/`.
- Small, reviewable commits. Explain schema changes before applying them.
- Ask before adding a third-party dependency.
- Write a short ADR in `docs/decisions/` for any notable architecture choice.
