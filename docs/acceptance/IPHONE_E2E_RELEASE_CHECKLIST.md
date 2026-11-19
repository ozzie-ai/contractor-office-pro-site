# First native iPhone estimate: release verification runbook

**Status:** Integration draft. Do not merge with main or send a customer a contract based only on unit tests.

## What is in GitHub now

- Existing Derek native Swift app, Supabase auth and offline job/customer models.
- Private on-device EN/ES voice capture and protected text draft per job.
- Swift interface for `/v1/interpret`, `/v1/estimate/price`, `/v1/pricebook`.
- Explicit missing-scope review, per-task cost/rate selection, approval and allowlisted preliminary PDF.
- Server-only FastAPI backend with verified JWT/membership, deterministic pricing and saved contractor rates.
- Backend regression suite and native macOS CI build checks.

## Server deployment prerequisites

1. In `backend/`, copy `.env.example` to **untracked** `.env`; set `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` privately on your server. The quick five-outlet phrase is handled locally by deterministic interpretation, but all other trades require a supported model and valid key.
2. Reuse Derek's existing Supabase development schema, including `members` and `price_book_items` with row-level security. Verify that the authenticated owner can see their own member row and cannot see another business's rows.
3. Build the supplied container from the repository: `docker build -t contractor-pricing ./backend`.
4. Run behind **HTTPS** in a service you control. Example local-only test (not internet-exposed): `docker run --rm --env-file backend/.env -p 127.0.0.1:8766:8080 contractor-pricing`. Confirm `curl http://127.0.0.1:8766/health` returns `{"status":"ok","component":"pricing_api"}`. Do not use an HTTP endpoint from iOS.
5. Verify authorized `POST /v1/interpret`, `POST /v1/estimate/price`, `GET/POST /v1/pricebook` with a real test account's short-lived Supabase access token. Never paste a token in GitHub discussions.

## iPhone setup on the Mac

1. In terminal: `git fetch origin && git checkout integration/electrical-acceptance-20261113 && git pull`.
2. `cd ios && cp Config/Config.example.xcconfig Config/Config.xcconfig` (if you do not already have a local config). Fill in only the Supabase public URL/key and the **HTTPS** estimating backend URL. No OpenAI key or service-role key belongs in this file.
3. `brew install xcodegen` (if needed), then `xcodegen generate`.
4. Open `ContractorOfficePro.xcodeproj` in Xcode 26.3. Use your development signing team; select the plugged-in iPhone and run. This is Derek's Swift app, **not** the original Expo app.
5. Sign in to a development account, create a job, open that job, and tap **Prepare estimate**. Spoken input requires Speech and Microphone permissions. If the locale does not support on-device recognition, use typed notes or keyboard dictation instead.

## Acceptance exercise (real phone)

1. Capture: `Cambiar cinco tomacorrientes, dos son GFCI` (or the English equivalent). Confirm **3 standard / 2 GFCI** and no duplicated outlets. A standalone outlet replacement should not ask for an unrelated bathroom, breaker or panel.
2. Review the one missing-site-condition question. Confirm existing wiring/plates and whether permit/work beyond outlet replacement is needed; price additional work explicitly if in scope.
3. Set labor and material inputs using **actual contractor costs**, or explicitly choose a previously saved installed selling rate. The app does not claim live Home Depot/Lowe's prices.
4. Add overhead, profit and **one** mobilization allowance as appropriate. Calculate. Missing quantities/rates must block a final total; no guessed zero.
5. Approve the completed draft; produce and share the preliminary PDF. Confirm it contains a clear scope and **one selling total**, not transcripts, internal labor/material costs, overhead or profit.
6. Re-open the same job without network: the protected private dictated text should still be available. Network interpretation/pricing will need reconnection; offline calculated estimates are not yet implemented.
7. Confirm a second test business cannot read the first business's rates or jobs. Confirm a revoked login is denied.
8. Run `pytest` and `xcodebuild test` in supported toolchains; save CI/run logs and actual PDF screenshots for review.

## Completion criteria still requiring evidence

A connected, authenticated **real iPhone** demonstration with actual labor/material inputs and a reviewed PDF; test-user Supabase policy checks; deployed HTTPS backend and OpenAI permission; actual mixed electrical panel scenarios; offline syncing reliability; and contractor feedback.

**Until those pass, this branch is a development candidate, not a released application.** Existing Expo production/pilot stays untouched.
