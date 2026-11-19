# Render staging deployment: controlled existing free service

Source of truth is `main`, not old PR branches. The Render staging service already exists:
`srv-dbtnoj3m8hqs73d0vvcg`, URL https://contractor-office-pro-api-staging.onrender.com

**As of November 19:** Render dashboard confirms last shown live deployment `49cd6d5` from November 16, while current backend code on `main` contains the no-cost bilingual mixed-device parser (PR #54), nonsecret capabilities endpoint, and auth-vs-AI readiness separation (PR #55). The new backend code is **not** on Render until deployed.

## One-time account-controlled setup (no fees or production data)

1. Open the existing [Render staging service](https://dashboard.render.com/web/srv-dbtnoj3m8hqs73d0vvcg), check Settings > Build & Deploy: branch `main`, Root Directory `backend`, Dockerfile Path `Dockerfile`, Build Context `.`, service plan Free. Existing service only; **do not create new service or upgrade plan**.
2. In Render Settings, create/copy the service's **Deploy Hook** URL; it is a credential. Store it as `RENDER_STAGING_DEPLOY_HOOK_URL` in GitHub Settings > Secrets and variables > Actions > Environment secrets for environment `staging`. **Never paste the hook into chat, a file, or source control.**
3. Run GitHub Actions > **Deploy Render staging (manual, free service)** > Run workflow on `main`, enter `DEPLOY-STAGING`. The action runs backend tests, validates the hook targets this existing service, requests deployment, and checks the live `/v1/capabilities` route before reporting success.

## Acceptance
- `GET /health`: HTTP 200.
- `GET /v1/capabilities`: HTTP 200, boolean `deterministic_device_interpretation: true`, `pricing_math_available: true`, `live_provider_verification: false`. The latter is deliberately false until an actual signed-in account has been tested.
- `GET /ready`: HTTP 200 when Supabase Auth URL and public key are configured; optional paid AI must **not** cause 503.
- No-token `GET /v1/account/status`: HTTP 401.
- With owner's authorized email, separately test an actual Supabase OTP flow and first-org bootstrap. Do not claim success merely because these public endpoints pass.

## Rollback
If deployment causes problems, select the previous known-good Render deploy `49cd6d5` in the existing service dashboard and use the host's rollback/redeploy control. No database migration is part of this release. Existing iPhone-local jobs remain untouched.

## Limitations
This is an opt-in manual workflow that cannot run until the owner connects the Render hook into GitHub. It does not install the Expo app on Mac/iPhone, import unapproved research data, start paid OpenAI usage, or create cloud accounts.
