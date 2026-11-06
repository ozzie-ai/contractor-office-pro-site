# Contractor Office Pro — Mobile App (iOS and Android)

**Status:** first Expo/React Native pilot committed; not yet an installed or App Store–published build.

This lives under `/mobile` in the existing `ozzie-ai/contractor-office-pro-site` repository. The current GitHub Pages estimator and Level 2 browser pilot are deliberately left intact.

## Implemented in the first mobile codebase
- Six trade choices: electrician, plumber, painter, concrete, handyman and remodeling.
- Contractor/customer details; natural-language text job description; example mixed electrical job.
- Camera/library photo selection, with photos kept local and not included in customer PDFs.
- Configurable call to the Level 2 AI backend `/api/interpret` using a **private beta tester token**, not an AI key.
- AI results converted to editable bilingual work items. **All uncertain or allowance items are retained**, with missing quantities/rates at zero pending review.
- Editable quantities, units, labor/material line rates, overhead and profit.
- Customer estimate in professional English or Spanish, generated to PDF through `expo-print` and shared through `expo-sharing`.
- Customer document does **not** include the private dictated notes, access token, or private worksite photos.

## Important limits (not implemented yet)
- **Voice recording is implemented in the mobile interface.** Users can record on-device and then request transcription through the secure `/api/transcribe` endpoint. Live transcription requires Derek to deploy/configure the backend. Audio stays local until the user explicitly taps Transcribe.
- No live Home Depot/supplier pricing feed, payment processing, account management, cloud projects, automatic draft persistence, app-store submission, or full test-device validation.
- AI can structure scope but the user must verify work, quantities and prices. Zero rates are intentionally not silently replaced with invented prices.
- `COP_BETA_TOKEN` is a temporary shared pilot access mechanism; replace with authenticated per-user access and usage quotas before public launch.
- The OpenAI API key is held **only by a protected server** (the root `/api/interpret.js`), never inside this mobile package.

## Run for developers

Use Node.js >=22.13 and current npm.

```sh
git clone https://github.com/ozzie-ai/contractor-office-pro-site.git
cd contractor-office-pro-site/mobile
npm install
npx expo install --fix
npm run check
npm start
```

Connect Expo Go or a development build and test iPhone/Android. Expo SDK 58 requires compatible Expo Go/device support; if your device's Expo Go version is incompatible, create an EAS development build or align the SDK with your device.

The API backend must be deployed separately to Vercel with `OPENAI_API_KEY` and `COP_BETA_TOKEN` environment variables (see root `LEVEL2_SETUP.md`). Never paste `OPENAI_API_KEY` in the app. A tester inputs only the backend URL and temporary beta access code.

## Suggested integration milestones
1. Run the mobile app on two real devices; verify photos and PDF sharing.
2. Derek connects the existing secure AI interpreter backend and validates `MIXED-001` / `MIXED-002` on devices.
3. Test the newly implemented microphone recording and server-side speech transcription on iPhone and Android; verify permissions and transcript accuracy.
4. Add validated, editable trade rate books by location; no invented price confidence.
5. Add local drafts, then optional cloud sync, accounts, rate limits, subscriptions and store distribution.

## Collaboration
Derek can work on `mobile/` and `api/` in the same repository once the owner invites his GitHub account as a collaborator. We can split responsibilities with branches and pull requests. Do not add any API secrets to pull requests or commits.

## References
- https://docs.expo.dev/get-started/create-a-project/
- https://docs.expo.dev/versions/latest/sdk/imagepicker/
- https://docs.expo.dev/versions/latest/sdk/print/
- https://docs.expo.dev/versions/latest/sdk/sharing/

## Native dictation — no OpenAI key needed

Mobile speech-to-text is now separated from the AI estimator. It uses `expo-speech-recognition` (Apple SFSpeechRecognizer on iPhone, Android SpeechRecognizer on Android) and writes directly into the editable customer job notes.

**Expo Go does not bundle this third-party native module.** The Expo Go screen retains a clear, usable fallback: tap the transcript text box and use the microphone on the native iPhone keyboard. For the app's large one-tap direct speech-to-text control, install a custom development build.

On the developer's Mac:

```sh
cd ~/contractor-office-pro-site/mobile
git pull --ff-only origin main
npm install
npx expo install --fix
npm run check
npx expo install expo-dev-client
npx expo run:ios --device
```

The last command requires Xcode, iOS signing, and a connected device. It compiles/installs a Contractor Office Pro development build, not Expo Go. Alternatively, use `eas build --platform ios --profile development` with Apple signing and the appropriate Expo/EAS account. After installation, run `npx expo start --dev-client` to send JS updates. A **new native build** is required whenever adding/removing native modules or permissions.

On iPhone, grant Microphone + Speech Recognition permissions and choose **Español** or **English** before starting. Recognized interim/final text appears immediately in the editable box and may be corrected by the contractor. Device support and network usage depend on locale and OS settings: this is independent of OpenAI, but it does **not** guarantee offline-only processing.

The AI interpretation step remains separate and optional. Its endpoint/token are unrelated to iOS/Android voice transcription.
