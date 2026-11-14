# Contractor Office Pro — first authenticated backend slice

This is a **functional, locally testable draft** of the server-side interpreter and deterministic estimator. It is **not deployed** or integrated with the Swift UI. No cloud credentials are required to run tests.

## Run

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. pytest -q
uvicorn app.main:app --reload --port 8766
```

Required server environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and (for interpretation) `OPENAI_API_KEY`. Use the existing `backend/.env.example` as a template; do not commit populated `.env` files. Public `/health` needs no credentials. Every pricing and interpretation request requires `Authorization: Bearer <Supabase-user-token>`. The API verifies the token with `/auth/v1/user`, then resolves membership through the RLS-protected `members` table. The request cannot choose an arbitrary `org_id`.

## API

- `POST /v1/interpret`: `{"description":"Change five outlets including two GFCI"}` → schema-validated bilingual job scope. The model may NOT set prices.
- `POST /v1/estimate/price`: typed work items and contractor-approved cost inputs → a deterministic PRIVATE draft. All rates are **contractor-entered** or declared **planning allowances**, never claimed as live store or pricebook observations.
- `GET /v1/pricebook` / `POST /v1/pricebook`: list or create the authenticated contractor's own saved rates using Derek's existing `price_book_items` Supabase table and user-scoped RLS. No external market-price verification is implied.
- `GET /health`: public service readiness check.

### Example: five-outlet estimate

This POST body deliberately includes **illustrative test assumptions**, not researched market prices:

```json
{
  "items": [
    {"task_code":"outlet.standard","description_en":"Replace standard outlets","quantity":3,"unit":"each","direct_cost":{"labor_hours_per_unit":0.6,"loaded_labor_rate":60,"material_cost_per_unit":15,"source":"planning_allowance"}},
    {"task_code":"outlet.gfci","description_en":"Replace GFCI outlets","quantity":2,"unit":"each","direct_cost":{"labor_hours_per_unit":0.75,"loaded_labor_rate":60,"material_cost_per_unit":30,"source":"planning_allowance"}}
  ],
  "overhead_pct":10,"profit_pct":20,
  "mobilization_direct_cost":75,"mobilization_source":"planning_allowance"
}
```

The illustrative result is **$498.96**. The $75 mobilization is charged exactly once. An absent task quantity or cost makes `status=incomplete` and `selling_total=null`. Contractor selling-price overrides are not marked up twice. The pricing endpoint also accepts an explicit `price_book_item_id` (UUID) instead of a direct cost; the server resolves that ID only inside the current authenticated organization and treats its stored `unit_price` as an already-marked-up selling rate. Matching units are required. Duplicate task codes in the same scope are blocked for review. Repeated trade tasks across distinct rooms use different `scope_id` values.

`customer_projection` is an allowlist-only demonstration of public PDF data; it does not run without `approved=True` and complete pricing. **No customer export route exists yet**, and no raw transcript/private notes are returned as public scope.

## Remaining integration work

1. Map AI-suggested `task_code` to permitted, authenticated `trade_tasks` catalog records and regional cost observations. Explicitly selected **saved contractor rates** can now be retrieved by ID, but automatic city/metro price lookup and live retailer pricing are **not** implemented.
2. Connect the native Swift voice/photo review screen to these endpoints and contractor approval; deliver a native PDF only after a confirmed review. A typed `ios/ContractorOfficePro/Services/EstimatingAPIClient.swift` network bridge has been added but is **not yet wired to screens**.
3. Integration-test Supabase auth and multi-tenant isolation with real development accounts, OpenAI interpretation against the existing `tests/scenarios.json`, and the native iPhone UI.
4. Add backend deployment, quotas, rate limiting, centralized monitoring, and explicit live-cost refresh before broad use.

Do not merge over the existing pilot until the end-to-end acceptance gate passes. Existing `api/interpret.js` and Expo app remain untouched.
