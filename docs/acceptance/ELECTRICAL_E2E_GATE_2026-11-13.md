# Electrical end-to-end acceptance gate (2026-11-13)

This document defines the **first usable paid-pilot milestone**. It is not evidence that the backend or native iOS integration already works. Keep this work isolated from `main` and the existing Expo pilot.

## Demonstration required
On a real iPhone, dictate in Spanish or English: "Replace five outlets: three standard and two GFCI." Capture once; parse; calculate a contractor-editable draft; approve; export a customer-facing PDF. Run the same request after losing network connectivity, confirming offline capture and clear pending-sync status. Never silently claim that an offline recording was sent.

## Contract and data safeguards
1. Transcription returns only text; interpretation returns **typed tasks, quantities, units, exclusions, missing questions and task codes**. Neither may return monetary totals.
2. Normalize the five-outlet request to **3 standard + 2 GFCI = 5 total**. Do not create five standard outlets plus two GFCI. Replacement and new installation are different task types.
3. Materials and labor must use explicit task assemblies. Unspecified box/wire/plate requirements remain reviewable allowances, not invented confirmed takeoffs.
4. Pricing service uses exact decimal arithmetic: direct cost = loaded labor + materials + equipment + other; selling price = direct cost × (1 + overhead) × (1 + profit), with consistent documented rounding. Never double-apply margins to contractor selling-price overrides.
5. Every material rate carries source type (contractor confirmed / dated permitted reference / unverified allowance), observation date if applicable, region, and a preliminary flag. Cached store references are **not** represented as live Home Depot or Lowe's prices.
6. An unknown quantity or essential rate prevents a **final** quote; a clearly marked draft may show known subtotals. The contractor must explicitly approve before export.
7. Customer PDF contains reviewed scope, quantities where useful, exclusions and one approved selling total. It must exclude raw transcript, photos, private notes, material acquisition prices, loaded labor costs, overhead and profit.
8. Server resolves organization from verified user membership, not from client-supplied `org_id`. Test cross-organization denial and private error responses. No API keys in iOS code.
9. Reuse the existing `database/migrations/001_pricing_catalog.sql` concepts and `tests/scenarios.json`; do not create competing pricing definitions.
10. The native Swift app must retain EN/ES UI coverage and work with captured drafts offline. Production PDF/contract status must remain **preliminary estimate**, pending legal review.

## Required regression fixtures
- **OUTLETS-005:** 5 replacements, 2 GFCI -> 3 standard + 2 GFCI; one mobilization allowance, not five.
- **OUTLETS-005-ES:** "Cambiar cinco tomacorrientes, dos son GFCI" -> same quantities and task categories.
- **MIXED-001:** panel 100A -> 200A, 20 existing circuits and one 40A EV circuit, 100-foot run; EV breaker charged once; no ADU.
- **MIXED-002:** same panel and EV work plus **one reserved 100A breaker**; future feeder/subpanel explicitly excluded, not priced.
- **UNKNOWN-RUN:** EV charger with unspecified cable length -> missing length question, no fabricated footage or final price.
- **PRIVATE-PDF:** hidden transcript includes arbitrary confidential text -> exported PDF never includes that text.
- **CROSS-TENANT:** user in org A requests org B job/pricebook -> denied, no customer details leaked.
- **OFFLINE-QUEUE:** create draft and attach photo without signal; verify local persistence and queued upload; reconnect without duplicate job creation.

## Definition of done
- Automated tests covering fixtures above run in CI; report test commands and pass/fail evidence.
- End-to-end demonstration shows real Swift client -> authenticated backend -> deterministic pricing -> approval -> PDF.
- At least one real contractor reviews the resulting small-job estimate and records corrections.
- Keep PR #42 in draft until the integration, privacy, pricing provenance, and offline behavior are demonstrated.

## Coordination
Derek owns the Swift client and backend integration. Existing Expo pilot may consume the same versioned API later. Avoid a second pricing engine or replacing the existing pilot before acceptance.
