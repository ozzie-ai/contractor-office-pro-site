# Contractor Office Pro — iPhone app (source of truth)

**Current as of Nov 19, 2026:** We are developing and testing the **Expo / React Native app installed on a physical iPhone using Xcode on the user's Mac**. Derek's separate native Swift source is also preserved under [ios/](../ios/INTEGRATION_README.md) for future reuse; do not treat this as a unilateral iPhone-only or Expo-only platform decision. The phone app has already been built and installed.

## What code is authoritative?

- **Canonical release code:** `main` now contains the combined Expo/Derek backend integration and mixed-device fixes from merged PR #51 (Expo v0.1.1). PRs #46 and #50 are historical source branches, not what the Mac should switch to. GitHub code still will NOT appear on the iPhone until its developer Mac pulls `main` and reloads/builds it.
- **The actual phone app:** `mobile/App.tsx`. Existing five-stage flow: Job → Scope → Price → Send → Follow-up.
- **Voice description:** `mobile/src/SpeechInput.tsx` currently uses the iPhone **keyboard microphone** for dictated English/Spanish text; direct native speech capture was replaced during investigation of a crash.
- **Existing local features:** saved draft jobs and photos (`mobile/src/jobDrafts.ts`), local scope/estimating, editing quantities/line prices, preliminary cost assumptions, private cost/overhead/profit review, customer PDF export (`expo-print`, `expo-sharing`), and bilingual UI.
- **Trade choices in app:** electrical, plumbing, painting, concrete, handyman, remodeling, cleaning. These are categories and examples, NOT a ceiling on planned residential services or proof all jobs have verified automatic prices.
- **Not current for iPhone testing:** the public GitHub Pages web pilot v44. It is not a preview of the current iPhone build. That website is not a preview of the latest iPhone build.
- **Backend connection:** `mobile/src/sharedEngine.ts`; cloud OTP, first-business bootstrap, shared pricing check and optional AI scope now exist in `main`, but live-device end-to-end testing is pending.

## Cloud implementation and version gap

- **Supabase:** `Contractor Office Pro Dev`, 12 RLS-protected app tables, migrated and running.
- **Render Free:** FastAPI was deployed at `https://contractor-office-pro-api-staging.onrender.com` on Nov 16, 2026. **The last deployment recorded in project documentation was `173238e`**, before first-time contractor bootstrap changes. A GitHub Actions probe confirmed `/health` returned HTTP 200 on Nov 19, but it cannot establish which revision Render is running. **Manually deploy the latest approved backend from `main` before testing first-contractor signup.** Live hosting is not proof of working iPhone-to-cloud authentication.
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

When `git status --short` is clean, update the consolidated release. If local changes appear, **do not overwrite them**; preserve and review first.

```sh
git switch main
git pull --ff-only origin main
cd mobile
cp -n .env.example .env
npm install
npm run check
npm test
npm run ios:device
```

Once the app is installed, run the Expo development server if needed:

```sh
npx expo start --dev-client --lan --clear
```

The app's visible version should read **0.1.1**. Reopening an old QR code does not install new native builds. Do not delete the app: local jobs and photos are device-stored.

`npm run ios:device` uses the existing Xcode device build process (`expo run:ios --device`, plus the Xcode compatibility patch). Connect the physical iPhone and select it when asked. The bundled `mobile/.env.example` contains only the **public** Supabase and Render URLs/keys; private OpenAI or database secret keys must never go in `mobile/.env`.

For JS-only edits with an existing compatible native dev build, the Mac can also run `npx expo start --dev-client --lan --clear` and reload the installed iPhone app. Do not use `npx expo start --web`, GitHub Pages or Expo Go as substitutes for the Xcode-built phone app. **Never run `git reset --hard`, `git clean`, delete saved jobs or uninstall the app merely to update it.**

## Real iPhone acceptance checklist

1. Existing saved jobs, photos, business profile, full five-step flow and bilingual keyboard dictation still work.
2. Estimate creation/editing and customer PDF work, and internal costs/private notes do not leak into the PDF.
3. Local app still works without Wi-Fi.
4. After latest backend deployment, a numeric Supabase OTP email signs in a new contractor, creates/verifies its own business membership, and permits authorized backend price checks.
5. Validation covers painting, concrete, plumbing, electrical and remodeling—not just isolated demo trades; distinguish preliminary rates from verified prices.

Passing GitHub Actions CI is **not** proof that the installed iPhone app passed these real-device checks. Do not refer to the outdated static website when reporting progress.
