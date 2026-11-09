# Contractor Office Pro — Universal Estimating API Contract (proposed v1)

Status: PROPOSED for Derek's backend review. No endpoint below is claimed to be deployed.
Owner experience: **Walk the job. Take photos. Talk naturally. Get your estimate prepared.**

## Scope and roles

- Mobile (Expo): consent, user-facing EN/ES intake, optional photos/voice, editing, review, save and PDF; never expose provider API keys or database credentials.
- Backend (Derek): private auth, transcription, multimodal extraction, structured estimate, regional cost references, provenance and errors. Support all trades through the same interface.
- Human contractor: confirm scope and proposed prices. The system must not invent unknown quantities or assert unverified prices as facts.

## Proposed endpoints

- `GET /api/health` — non-sensitive `{ "ok": true, "api_version": "v1" }`. No public database metadata.
- `POST /api/v1/interpret` — accept job description and optional media IDs; return normalized scope without pricing.
- `POST /api/v1/estimate` — accept normalized scope, location and pricing preferences; return proposed priced lines and remaining questions. Single general engine across trades.
- `POST /api/v1/transcribe` — secure audio transcription, explicit user consent, bounded upload size; language can be `auto`, `en`, or `es`.
- `POST /api/v1/media` — optional authenticated temporary media upload; return opaque ID (not public URL). Backend must not put audio transcript/photo links in customer output.

Endpoint names are proposals, not implemented or integrated as of this document. Derek may propose alternatives; agree on one contract before connecting the app.

## Interpretation request example

```json
{
  "schema_version": "1.0",
  "request_id": "demo-electrical-001",
  "trade_hint": "electrical",
  "language": "es",
  "job": {
    "description": "Upgrade electrical panel from 100A to 200A, transfer 20 existing circuits, install 100A breaker only for future work, permit $500.",
    "city": "Santa Clarita",
    "region": "US-CA-LA"
  },
  "media_ids": []
}
```

## Response shape from /interpret

```json
{
  "schema_version": "1.0",
  "request_id": "demo-electrical-001",
  "status": "needs_review",
  "trade": "electrical",
  "scope_items": [
    {
      "id": "panel-upgrade",
      "description_en": "Upgrade electrical panel from 100A to 200A",
      "description_es": "Actualizar panel eléctrico de 100A a 200A",
      "quantity": 1,
      "unit": "job",
      "quantity_status": "stated",
      "included_now": true,
      "pricing_hint": "panel_service_upgrade"
    }
  ],
  "exclusions": [],
  "future_work": [],
  "questions": [],
  "private_notes": [],
  "confidence": "medium"
}
```

Each scope item must have a stable ID and explicit `quantity_status` of `stated`, `derived`, or `unknown`; unknown quantity is `null`, never 1 by default. Do not return the full raw transcript as a customer-facing scope line. The interpreter must consider negations and future work (e.g. *no future feeder wiring*); future work excluded from current total. Include `questions` for materially missing information. `private_notes` remain internal and never appear in PDFs.

## Pricing request and output

Request: same `schema_version`, `request_id`, `trade`, `region`, `scope_items`, plus `overhead_pct`, `profit_pct`, `currency` (USD), and contractor-approved `overrides` keyed by stable ID. Prefer a single backend pricing strategy with adapters/reference data per trade, not bespoke rule for each user job.

Each returned price line:
- `scope_item_id`, `quantity`, `unit`, `unit_rate` (USD or `null`), `extended_amount` (USD or `null`)
- `rate_status`: `verified_reference`, `modeled_allowance`, `contractor_override`, or `unavailable`
- `source`: title, URL or internal reference ID, observed date and region; for modeled allowances, disclose assumptions; never fabricate citations or claim current market quotes without real retrieval.
- optional `labor`, `materials`, `equipment` components when supported; avoid double-counting all-in benchmarks.

Summary: `direct_subtotal`, `overhead`, `profit`, `estimated_total` **only if every included line has a valid quantity and rate**. Otherwise `estimated_total: null`, `priced_subtotal` and `status: incomplete` with actionable `questions`. Clearly distinguish tentative model prices from supplier bids.

## Hard behavioral requirements

1. A fully described job yields **all recognized scope items**, not only a permit.
2. A $500 permit with no panel price must **not** display $660 as the total price for a panel upgrade.
3. Partial quantity/price should never silently become zero-cost included work or an apparently complete client proposal.
4. Changing a transcript and regenerating scope must preserve contractor overrides using stable item IDs, unless the contractor explicitly removes work.
5. Customer proposal defaults to English, Spanish selectable; excludes transcript, internal notes, sensitive credentials and private photos.
6. Do not present `status: complete` based solely on adding generic market allowances when the work scope itself is incomplete.
7. Return user-friendly error codes: `AUTH_REQUIRED`, `TRANSCRIPTION_FAILED`, `INTERPRETATION_UNAVAILABLE`, `PRICING_UNAVAILABLE`, `NEEDS_MORE_DETAIL`, `RATE_UNAVAILABLE`. Clients offer retry or review, not server setup.
8. Secure access: rate limits, encryption in transit, token management/server-held keys, privacy/retention controls and consent for audio; no arbitrary untrusted URLs passed as backend fetch targets.

## Acceptance gates (before app integration)

- Check electrical panel, bathroom remodel, cleaning, and unrelated trades through identical contract. Cases are provided in `docs/fixtures/universal-estimator-acceptance.json`.
- Contract test validates all fixture outputs and exceptions. The API must not infer unmentioned work, and must preserve all explicit quantities and exclusions.
- Known 100A→200A example needs panel replacement, 20 existing circuits, 100A breaker-only, and $500 permit; future wiring excluded. If dictated words omit the breaker, ask instead of inventing it.
- A clean estimate must produce a customer-safe PDF after review, without transcript. An incomplete estimate cannot be mislabeled final.
- Test on physical iPhone with saved and new jobs. Existing on-device drafts must survive app updates.

## Coordination

Derek: please propose actual route names, auth scheme, payload size limits, pricing provenance and deployment environment in a PR against this document. Do **not** commit production API secrets. Frontend stays on existing local fallback until the API passes integration tests. Separate feature branches protect current iPhone app.
