# Contractor Office Pro — iPhone app (source of truth)

**Current as of Nov 16, 2026:** We are developing and testing the **Expo / React Native app installed on a physical iPhone using Xcode on the user's Mac**. We are NOT testing the old GitHub Pages website, and must not replace the Expo UI with a separate Swift UI. The phone app has already been built and installed.

## What code is authoritative?

- **Current working integration branch:** `integration/expo-fastapi-supabase-unified-20261115`, draft PR #46. It includes the existing Expo app plus backend/auth integration. **It is not merged to `main`**, and GitHub commits will NOT appear on the iPhone until the Mac pulls the branch and loads/builds the app.
- **The actual phone app:** `mobile/App.tsx`. Existing five-stage flow: Job → Scope → Price → Send → Follow-up.
- **Voice description:** `mobile/src/SpeechInput.tsx` currently uses the iPhone **keyboard microphone** for dictated English/Spanish text; direct native speech capture was replaced during investigation of a crash.
- **Existing local features:** saved draft jobs and photos (`mobile/src/jobDrafts.ts`), local scope/estimating, editing quantities/line prices, preliminary cost assumptions, private cost/overhead/profit review, customer PDF export (`expo-print`, `expo-sharing`), and bilingual UI.
- **Trade choices in app:** electrical, plumbing, painting, concrete, handyman, remodeling, cleaning. These are categories and examples, NOT a ceiling on planned residential services or proof all jobs have verified automatic prices.
- **Not current:** the public GitHub Pages web pilot v44 or older `main` code. That website is not a preview of the latest iPhone build.
- **Backend connection:** `mobile/src/sharedEngine.ts`; cloud OTP, first-business bootstrap, shared pricing check and optional AI scope exist in branch #46, but live-device end-to-end testing is pending.

## Cloud implementation and version gap

- **Supabase:** `Contractor Office Pro Dev`, 12 RLS-protected app tables, migrated and running.
- **Render Free:** FastAPI was deployed at `https://contractor-office-pro-api-staging.onrender.com` on Nov 16, 2026. **The deployed commit was `173238e`**, before the branch added first-time contractor business bootstrap. **Manually redeploy the latest commit from the integration branch before testing new contractor signup.** Live hosting is not the same as a successful iPhone-to-cloud test.
- **AI:** The OpenAI API key has deliberately not been set because of cost concerns. The non-AI local estimates still operate; AI backend interpretation will need separately funded API use.
- **Pricing:** master SQLite pricing data is not auto-synced to Supabase or iPhone; preliminary reference numbers are not guaranteed verified final selling rates. No blanket all-trades pricebook approval.
- **No cloud job/photo sync yet:** existing drafts/photos live in iPhone app documents. **Do not uninstall the existing app or erase its storage without protecting this data first.**

## How to test the CURRENT version on the iPhone

In the Mac Terminal first check for local changes; preserve them before switching branches:

```sh
cd ~/contractor-office-pro-site
git status --short
git branch --show-current
git fetch origin
```

When `git status --short` is clean, choose ONE of these paths:

```sh
# If the integration branch already exists locally:
git switch integration/expo-fastapi-supabase-unified-20261115

# OR if it does not exist locally:
git switch --track origin/integration/expo-fastapi-supabase-unified-20261115
```

Then `git pull --ff-only`, and:

```sh
cd mobile
cp -n .env.example .env
npm install
npm run ios:device
```

`npm run ios:device` uses the existing Xcode device build process (`expo run:ios --device`, plus the Xcode compatibility patch). Connect the physical iPhone and select it when asked. The bundled `mobile/.env.example` contains only the **public** Supabase and Render URLs/keys; private OpenAI or database secret keys must never go in `mobile/.env`.

For JS-only edits with an existing compatible native dev build, the Mac can also run `npx expo start --dev-client --lan --clear` and reload the installed iPhone app. Do not use `npx expo start --web`, GitHub Pages or Expo Go as substitutes for the Xcode-built phone app. **Never run `git reset --hard`, `git clean`, delete saved jobs or uninstall the app merely to update it.**

## Real iPhone acceptance checklist

1. Existing saved jobs, photos, business profile, full five-step flow and bilingual keyboard dictation still work.
2. Estimate creation/editing and customer PDF work, and internal costs/private notes do not leak into the PDF.
3. Local app still works without Wi-Fi.
4. After latest backend deployment, a numeric Supabase OTP email signs in a new contractor, creates/verifies its own business membership, and permits authorized backend price checks.
5. Validation covers painting, concrete, plumbing, electrical and remodeling—not just isolated demo trades; distinguish preliminary rates from verified prices.

Passing GitHub Actions CI is **not** proof that the installed iPhone app passed these real-device checks. Do not refer to the outdated static website when reporting progress.
