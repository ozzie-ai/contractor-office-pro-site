# Contractor Office Pro: one app, one shared engine — integration status

## Confirmed Supabase development connection — 2026-11-16

- Created development project **Contractor Office Pro Dev** in `us-west-1` with a quoted **$0/month** project-creation cost.
- Live project dashboard: https://supabase.com/dashboard/project/xhbbshryjdcotvwuslxd
- Project URL: `https://xhbbshryjdcotvwuslxd.supabase.co`.
- Applied and verified `contractor_office_pro_phase0_schema`, followed by `contractor_office_pro_security_hardening`. Verified **12 app tables all have RLS enabled**, and that signed-in users can query members and create job records under the policy model. No contractor users or tenant records have been provisioned yet.
- Added the **public** Supabase URL and publishable key to `mobile/.env.example`, and the public credentials to `backend/.env.example`. These contain **no OpenAI, service-role or secret API keys**. Expo will only load them after `mobile/.env.example` is copied into the Mac's untracked `mobile/.env`. The backend URL must remain unset until HTTPS hosting actually exists.
- Implemented email OTP first-time sign-up and server-verified business onboarding using the project's `create_org_for_user` RPC. This is unit tested; **no real email was sent and no real login was tested yet**. Check the production sign-in email template for a numeric `{{ .Token }}` before claiming the OTP screen works.
- Security advisor warnings for mutable trigger search paths and anonymous access to definer functions were resolved. Four advisor warnings remain for intentionally callable authenticated `SECURITY DEFINER` functions (three RLS helpers plus business bootstrap); audit these before public release. Do not enable unrestricted launch until authorization and rate limiting are tested.
- The **FastAPI service is still not deployed**. Connect Render (or another HTTPS host), configure server `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key), and `OPENAI_API_KEY`, then set `EXPO_PUBLIC_COP_BACKEND_URL` in Expo and run real device tests.
- Master residential pricing data and cloud job/photo synchronization are **not yet integrated**. Existing local estimates are preserved.

## Architecture and what has really been done

- **Expo React Native remains the only user-facing app**. Preserve Job → Scope → Price → Send → Follow-up, local job drafts, photos, editable estimates, and private-versus-customer PDF separation. No new SwiftUI interface is being substituted.
- The **FastAPI backend** is now included in this same integration branch under `backend/`, with auth-scoped interpret, deterministic price, contractor-owned pricebook routes, and unit tests.
- The **Supabase SQL schema** is in `supabase/migrations/`; it is **source code**, not evidence that a cloud database has been created or migrated.
- The **Expo bridge** is in `mobile/src/sharedEngine.ts`; AI draft and remote price cross-check only appear when all public runtime settings are present.
- Local Expo estimating and customer PDF remain usable offline. Backend-generated work items have **zero price** until a contractor verifies costs. There is no silent overwrite of the customer quote.

## Verified vs unverified

**Code shipped on this branch:** Expo bridge, backend server, SQL migrations, deployment blueprint, automated tests, status indicator. CI checks provide code-level confidence only.

**Not verified live:** cloud Supabase account/migration, real contractor membership, OpenAI provider call, HTTPS host, Expo-to-production-backend end-to-end connection, sync of jobs/photos, automatically approved regional pricing, external retailer price feeds, iPhone deployment. These need actual configured services and real-device QA. The separate local residential SQLite database is not automatically part of the Git repository or Supabase.

## Deploy only when hosting and Supabase are connected

1. Create or select a **development** Supabase project. Review and apply `supabase/migrations/20261106000001_phase0_schema.sql`. Do not run on an existing production project without backup and migration audit.
2. Provision a contractor organization and a permitted `members` record for an email-code test user. Backend auth demands valid user JWT **and** same-org membership; bare email signup does not grant membership.
3. Connect hosting (the root `render.yaml` is a non-deploying template). Deploy `backend/Dockerfile` with Docker context `backend/`. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY` on the server, never in Expo. `GET /health` is liveness; `GET /ready` checks only variable presence and **does not guarantee** external access.
4. In `mobile/.env` set ONLY the public `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_COP_BACKEND_URL` (HTTPS). Never insert service-role keys or an AI provider key into the client. A published/anon key is not a password.
5. Start Expo on a development Mac with `cd mobile && npx expo start --go --lan`. On the iPhone use Expo Go; custom native speech modules may require a development build. Verify OTP email login and membership before sending scope notes to backend.
6. Test full Job → AI structured scope → contractor verifies quantities/rates → authenticated price cross-check → contractor-approved PDF. Validate missing measurements, no invented prices, no duplicate markups, private transcript exclusion.
7. Integrate **verified** regional residential ratebook entries and safe offline/cloud job sync as separate, reviewed releases. Do not publish unverified database rows as market quotes.

## Tests (code-level, no cloud credentials needed)

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. pytest -q
cd ../mobile
npm install
npm run check
npm test
```

## What remains blocked by external accounts or offline-only data

- Hosting deployment requires a connected hosting account plus approval of any costs and a usable HTTPS endpoint.
- Supabase creation and migration require the project owner's account and review of existing data.
- Model calls require the owner's server-side API key and billing.
- The master residential SQLite price database must be available for quality audit, de-duplication and **approved rate** import; no data was silently invented or promoted into the cloud.
- Jobs and photos are not cloud-synced yet. Local saved data is not migrated automatically.
