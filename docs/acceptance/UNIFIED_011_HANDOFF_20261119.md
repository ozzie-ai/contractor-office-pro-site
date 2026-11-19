# Contractor Office Pro — unified Expo 0.1.1 release acceptance

Updated 2026-11-19. Source of truth: `main` after merged PR #51; do not deploy from the older PR #46/#50 heads.

## Verified in GitHub
- Six PR #51 quality workflows passed after the circuit-count fix: mobile typecheck, Expo estimating tests, Expo quality suite, backend unit tests, local database tests, pricing-data safety.
- New seven-device regression covers two switches, two regular outlets and three GFCIs with existing wiring; current default planning model returns a **preliminary** direct item sum of $835 and a $1,102.20 modeled total with 10% overhead and 20% profit. These are not verified current local selling prices.
- Contractor must explicitly approve device price assumptions; no automatic customer export from an unreviewed device allowance. Raw transcript, internal rates and overhead/profit must not appear in client PDF.
- Render staging public `GET /health` returned HTTP 200 `{"status":"ok","component":"pricing_api"}` in GitHub Actions on Nov 19. This does not confirm active deployed SHA, authentication, or AI readiness.
- Supabase `Contractor Office Pro Dev` has 1,674 research references, but **no approved `price_book_items`**, contractor organization/member or cloud jobs as last checked Nov 19.

## Still required before claiming user-ready
1. **Verified Nov 19:** Render exposes `/v1/account/bootstrap`, `/v1/account/status`, `/v1/interpret`, `/v1/estimate/price`, `/v1/research-references` and returns HTTP 200 on `/health`; anonymously calling account/status or presenting a deliberately invalid bearer token returns HTTP 401, confirming the authorization boundary. The configured `/ready` endpoint returns HTTP 503 because at least one required variable is absent (the code currently includes `OPENAI_API_KEY` in this check). Exact Render deployed commit SHA is not revealed by this public API; check Render dashboard before changes. **No blind redeploy is necessary just to make bootstrap route appear.**
2. **Still pending:** Supabase Auth and memberships currently have zero registered users, businesses, and members. With owner's consent, run real email OTP delivery, first business onboarding, member isolation, authenticated pricing call and log-out on the real iPhone. Source-controlled email templates contain `{{ .Token }}`, but their activation in the hosted Auth service has not been verified. Do not create test users or send OTPs to an unconfirmed email address.
3. Approve source-audited, regional, unit-consistent rates into the real pricebook before describing any price as verified or market sourced. Keep reference-only data read-only. Other residential trades still need richer assemblies and validation.
4. Run a real connected iPhone test: dictate seven devices EN/ES; verify 2 regular switches + 2 regular outlets + 3 GFCI; review prices, explicitly approve, save/reopen My Jobs and share a private PDF; repeat on painting/plumbing/concrete/remodel with missing-dimension safeguards.
5. Preserve device storage and local uncommitted Mac files. Run `git status --short` before `git switch main && git pull --ff-only origin main`. Do not uninstall the app. Version displayed after updated build should be 0.1.1.

## Developer responsibilities
- No need to rewrite Expo, clone Derek's Swift UI, re-import unapproved master data or reimplement the backend.
- Remaining owner/Derek-assisted actions are **live deployment/configuration and real-account/device QA**, plus **source-approved pricing catalog expansion**. Neither is implied by passing offline CI.

## Step 2 Render smoke test evidence

- GitHub Action: `.github/workflows/step2-live-backend-contract.yml` (merged PR #53). It performs unauthenticated and deliberately invalid-token *read-only* probes, does not create jobs or users, and checks no credentials into logs.
- On November 19, the successful probe returned: health 200; required OpenAPI paths present; missing-token 401; invalid-token 401; optional `/ready` 503.
- Supabase security advisor warns about four authenticated-executable `SECURITY DEFINER` functions (including `create_org_for_user`). The bootstrap implementation checks `auth.uid()` and uses the caller's own ID; the warnings should still receive a production security review. No security policies changed in this step.
- This is **partial Step 2 verification**, not a signed-in end-to-end pass. Do not advertise AI interpretation as operational while the provider API key is absent.

## Follow-on backend engineering (November 19)

- PR #54 merged: `backend/app/quick_devices.py` and unit tests add **no-cost**, bilingual deterministic backend interpretation for *explicitly counted existing-wiring device replacements* with switches, regular receptacles and GFCIs. Returns structured scope only, never automatic monetary rates. Mixed or unsafe scopes that cannot be parsed are deferred rather than silently reduced. The original outlet-only path remains supported.
- PR #55 merged: `/ready` now tests authentication infrastructure settings independently from the optional paid OpenAI model; `/v1/capabilities` shows non-secret flags `auth_environment_configured`, `ai_environment_configured`, `deterministic_device_interpretation`, and `pricing_math_available`. These represent *local environment presence and capabilities only*, not proof of a successful Supabase email-code login or external AI connection.
- Both backend Python test workflows passed in GitHub. **Important:** Render's last verified live response came from an earlier deployment. Neither merge by itself redeploys Render or updates the Xcode-installed iPhone app. Verify the current Render deployment SHA in the Render dashboard before testing these features.
- A real sign-in/first organization onboarding (and Auth email-template activation) remains an acceptance gate. The Supabase development project had zero users, memberships and organizations in the November 19 read-only audit. Never claim a full live Step 2 sign-in pass without a real authorized session.
