# ContractorOfficePro backend

FastAPI service for the AI steps. The OpenAI key and Supabase service key live only here (`backend/.env`).

## Run locally
```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/uvicorn app.main:create_app --factory --reload --port 8787
```
API docs: http://localhost:8787/docs (generated from the request/response models).

## Deploy (Fly.io)
```sh
cd backend
fly auth login                                  # once, opens the browser
fly launch --copy-config --no-deploy            # once: creates the app from fly.toml
grep -E '^(OPENAI_API_KEY|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' .env | fly secrets import   # once / on key change
fly deploy                                      # every release
```
Release iOS builds call `https://contractorofficepro-api.fly.dev` (set in `ios/Config/Base.xcconfig`).

## Endpoints
All `/v1` endpoints need `Authorization: Bearer <Supabase access token>`; the server resolves your business from `members`.

| Endpoint | Does |
|---|---|
| `POST /v1/interpret` | Notes/transcript (+ up to 6 photos) → structured tasks mapped to the catalog. Never prices. |
| `POST /v1/estimate/price` | Work items → priced lines: your price book, then the nearest regional reference (city → metro → state), else "needs price". Every line says where its number came from; references are preliminary unless verified and fresh. |
| `GET /v1/pricebook` | Catalog with your price and the reference price for your region |
| `POST /v1/transcribe` | Voice memo (multipart `audio`, optional `language` en/es) → transcript |
| `GET /health` | Liveness |

Errors are always `{"error": "<code>", "message": "<safe text>"}`; codes match the team's pilot
(`access_denied`, `no_business`, `invalid_request`, `ai_rate_limited`, `ai_timeout`, `ai_provider_failed`, `rate_limited`, …).
Messages never echo request content.

## Pricing data
- Reference tables (`price_sources`, `trade_tasks`, `price_regions`, `unit_cost_observations`) are global and read-only to
  the app; the server writes them. Contractor prices are `price_book_items` rows with a `task_code` (synced from the app).
- `python -m app.admin sync-catalog` — push `app/catalog.py` to `trade_tasks`.
- `python -m app.admin import-observations prices.csv` — add reference prices; rejects unknown tasks/regions and sources
  that don't allow commercial reuse.
- Formula: direct = hours × wage × burden + materials + equipment + other; price = direct × (1 + overhead) × (1 + profit).
  Observed bids that already include markup are used as-is.

## Tests
- `pytest` — no network; fakes for OpenAI and Supabase, real ES256 token checks.
- `python -m evals.run_scenarios --runs 3 [--vision]` — live accuracy check against the team's speech scenarios
  (`evals/team_scenarios.json`). Uses the real OpenAI key; a few requests per run.

## Design rules
- The model interprets; code computes. Output is a draft; photo/inferred items are always `allowance_to_confirm`.
- Catalog in `app/catalog.py` (moves to the `trade_tasks` table with pricing). New trades = catalog rows, not code.
- Per-user AI limit (60/hour) caps spend. Requests use `store=false`; logs never contain transcripts.
