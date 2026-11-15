# One Contractor Office Pro app: Expo + Derek's backend

## Decision

Keep the existing `mobile/` Expo React Native iPhone application as the only customer-facing app. It already captures job notes/photos, offers offline local estimating, saves drafts and prepares/shares professional customer PDFs. Reuse Derek's **Supabase organization/auth/ratebook** and the **FastAPI AI interpretation and deterministic pricing** service as shared capabilities. Do not embed SwiftUI screens in Expo or run a second disconnected app.

## First integrated beta slice (this PR)

- Existing **Job → Scope → Price → Send → Follow-up** UI remains.
- If AND ONLY IF public runtime URLs/keys are configured, a new optional Derek AI card appears in **Step 2 — Scope**.
- Contractor signs in with the **same business email used in Derek's Swift development app**. Supabase sends an email OTP. No password or JWT is committed. Beta session is memory-only and must be refreshed/reissued after a cold launch.
- AI returns ONLY structured English/Spanish task descriptions, quantities and open questions. Every generated line rate starts at $0 and must be reviewed. Existing priced work items require confirmation before replacement.
- An optional button in **Step 3 — Price** sends direct-cost inputs to Derek's deterministic engine and displays the result alongside the original Expo total; **it does not silently overwrite prices**. A stored selling price is never passed as a direct cost.
- Existing offline local estimating, saved job drafts, PDF and sharing remain functional even if Supabase/AI is not configured or reachable.

## Test without risk to existing local Xcode project

Your existing Mac has untracked `mobile/ios/`, `mobile/package-lock.json`, `mobile/app.json.backup-before-update` and `database/__pycache__/`. **Keep them. Do not run `git clean` or remove them.** Before installing a new beta over the app, export valuable estimates/photos from the installed iPhone pilot and consider copying `mobile/ios/` aside.

```bash
cd ~/contractor-office-pro-site
git fetch origin
git switch -c expo-derek-integration-test --track origin/integration/expo-derek-shared-engine-20261114
cd mobile
npm install
npm run check
npm test
# Existing iPhone development build: use Xcode 26.3 / your Apple team
npm run ios:device
```

### Enable the optional online AI panel

Copy `mobile/.env.example` to `mobile/.env`, filling ONLY:

- `EXPO_PUBLIC_SUPABASE_URL` — public Supabase development project URL
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — publishable/anon key; **not** service-role
- `EXPO_PUBLIC_COP_BACKEND_URL` — separately deployed HTTPS FastAPI URL implementing `/v1/interpret` and `/v1/estimate/price`

Restart the Metro dev server after setting variables. None of these values is a private service token. `OPENAI_API_KEY` and Supabase service-role keys belong **only on the backend host**. Do not copy the Swift app's private keys into Expo.

**Until the FastAPI service is deployed and Supabase membership is verified, the online AI option cannot be tested end-to-end.** This pull request is a **code-level bridge**, not a claim of a working live production connection.

## Integration follow-ups after first live test

1. Verify a logged-in contractor in Expo has Supabase `members` membership and tenant isolation.
2. Connect approved `price_book_items` as separately selected inputs without double-marking up selling rates.
3. Synchronize jobs and estimates to Derek's Supabase tables; resolve UUID/ownership and offline conflicts before uploading live client data.
4. Reconcile the pricing engine as the **single authority** once regional price observations and validated installed-work assemblies are available. Until then, Expo's current local calculator remains intact and remote totals are cross-checks only.
5. Test full electrical, bathroom, kitchen, painting, concrete and cleaning scenarios; verify customer PDF hides transcripts, cost breakdown and profit.
6. Test on the existing iPhone 15 Pro Max, then a second contractor's device. Only consider release after real job trials.

**No merge to `main` until QA and a private development deployment pass.**
