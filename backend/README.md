# ContractorOfficePro backend

FastAPI service for the AI steps. The OpenAI key and Supabase service key live only here (`backend/.env`).

## Run locally
```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/uvicorn app.main:create_app --factory --reload --port 8000
```
API docs: http://localhost:8000/docs (generated from the request/response models).

## Endpoints
All `/v1` endpoints need `Authorization: Bearer <Supabase access token>`; the server resolves your business from `members`.

| Endpoint | Does |
|---|---|
| `POST /v1/interpret` | Notes/transcript (+ up to 6 photos) → structured tasks mapped to the catalog. Never prices. |
| `POST /v1/transcribe` | Voice memo (multipart `audio`, optional `language` en/es) → transcript |
| `GET /health` | Liveness |

Errors are always `{"error": "<code>", "message": "<safe text>"}`; codes match the team's pilot
(`access_denied`, `no_business`, `invalid_request`, `ai_rate_limited`, `ai_timeout`, `ai_provider_failed`, `rate_limited`, …).
Messages never echo request content.

## Tests
- `pytest` — no network; fakes for OpenAI and Supabase, real ES256 token checks.
- `python -m evals.run_scenarios --runs 3 [--vision]` — live accuracy check against the team's speech scenarios
  (`evals/team_scenarios.json`). Uses the real OpenAI key; a few requests per run.

## Design rules
- The model interprets; code computes. Output is a draft; photo/inferred items are always `allowance_to_confirm`.
- Catalog in `app/catalog.py` (moves to the `trade_tasks` table with pricing). New trades = catalog rows, not code.
- Per-user AI limit (60/hour) caps spend. Requests use `store=false`; logs never contain transcripts.
