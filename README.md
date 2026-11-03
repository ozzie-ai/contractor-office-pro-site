# Contractor Office Pro — Pilot v2

A static, mobile-first bilingual contractor intake prototype. Open `index.html` locally or publish it as a static website using GitHub Pages or Cloudflare Pages.

## New in v2
- Kitchen Remodel selected by default, with other general-construction categories visible.
- English default, Spanish toggle throughout.
- Dictate project descriptions using the browser's Web Speech API, with an editable text fallback.
- Kitchen details: location (city/ZIP only), approximate area, cabinet linear footage, countertop area, included scopes, finish tier, layout changes.
- Select photos/PDFs locally. **Files are not uploaded, stored, analyzed, or included in downloaded summaries.**
- Generate an organized intake summary and open questions, copy it, download `.txt`, or print to PDF.
- No backend, sign-in, database, pricing feeds, payment processor, or receipt system.

## Important deployment caveats
- Speech recognition requires a compatible browser, microphone permission, and usually HTTPS. Some browsers may use a vendor speech-recognition service when transcribing; avoid dictating sensitive addresses or customer information until provider data handling is assessed.
- Non-kitchen categories currently support freeform description only, not trade-specific detail forms.
- This is an information-gathering prototype, NOT an actual estimate, drawing takeoff, licensed legal service, construction contract or blueprint analyzer.
- Validate and approve quantities, scope, local costs, permits and terms before quoting.

## Publish
1. Create a private GitHub repository named `contractor-office-pro`.
2. Upload the files from this folder, keeping `index.html` at repository root.
3. Connect Cloudflare Pages to that repository using a static/no-framework configuration.
4. Publish and test from mobile. No build command is needed and output directory is `/`.

## Next feature
Add secure customer submission and file storage only after choosing an authenticated backend, privacy policy, file validation and appropriate access controls. Add an estimate generator after testing actual sample jobs.
