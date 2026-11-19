# Contractor Office Pro — unified Expo 0.1.1 release acceptance

Updated 2026-11-19. Source of truth: `main` after merged PR #51; do not deploy from the older PR #46/#50 heads.

## Verified in GitHub
- Six PR #51 quality workflows passed after the circuit-count fix: mobile typecheck, Expo estimating tests, Expo quality suite, backend unit tests, local database tests, pricing-data safety.
- New seven-device regression covers two switches, two regular outlets and three GFCIs with existing wiring; current default planning model returns a **preliminary** direct item sum of $835 and a $1,102.20 modeled total with 10% overhead and 20% profit. These are not verified current local selling prices.
- Contractor must explicitly approve device price assumptions; no automatic customer export from an unreviewed device allowance. Raw transcript, internal rates and overhead/profit must not appear in client PDF.
- Render staging public `GET /health` returned HTTP 200 `{"status":"ok","component":"pricing_api"}` in GitHub Actions on Nov 19. This does not confirm active deployed SHA, authentication, or AI readiness.
- Supabase `Contractor Office Pro Dev` has 1,674 research references, but **no approved `price_book_items`**, contractor organization/member or cloud jobs as last checked Nov 19.

## Still required before claiming user-ready
1. Confirm the Render deployed SHA, and redeploy the current approved `backend/` revision if it remains behind the first-business bootstrap changes. Do not put private server secrets into Expo.
2. In an authorized Supabase test account, verify email code template/delivery, first business onboarding, member isolation and authenticated backend calls on the real iPhone. No real account setup has yet been proven.
3. Approve source-audited, regional, unit-consistent rates into the real pricebook before describing any price as verified or market sourced. Keep reference-only data read-only. Other residential trades still need richer assemblies and validation.
4. Run a real connected iPhone test: dictate seven devices EN/ES; verify 2 regular switches + 2 regular outlets + 3 GFCI; review prices, explicitly approve, save/reopen My Jobs and share a private PDF; repeat on painting/plumbing/concrete/remodel with missing-dimension safeguards.
5. Preserve device storage and local uncommitted Mac files. Run `git status --short` before `git switch main && git pull --ff-only origin main`. Do not uninstall the app. Version displayed after updated build should be 0.1.1.

## Developer responsibilities
- No need to rewrite Expo, clone Derek's Swift UI, re-import unapproved master data or reimplement the backend.
- Remaining owner/Derek-assisted actions are **live deployment/configuration and real-account/device QA**, plus **source-approved pricing catalog expansion**. Neither is implied by passing offline CI.
