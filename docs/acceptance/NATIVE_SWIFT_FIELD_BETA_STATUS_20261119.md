# Contractor Office Pro — Native Swift field beta status (2026-11-19)

## The actual product decision
User requested **one native SwiftUI iPhone app** with the tested Expo/RN app's familiar five-stage contractor workflow, bilingual UX and useful features. Preserve Expo under `mobile/` as the functional/visual benchmark. The native project under `ios/` remains the planned iPhone release client; it is **not** yet visually equivalent to the Expo pilot. Do not substitute the old question-only Swift interface for the promised product.

## Implemented and merged (code)
- PR #58: successive English/Spanish recording sessions preserve earlier typed/dictated notes; Swift composition check passed.
- PR #59: native Swift authenticated `/v1/interpret` already existed; added guarded response validation and stale-description protection before creating editable work items. Added private local jobsite photo attachments and contractor opt-in to server `/v1/photo/inspect`. Server requires JWT, explicit consent, validated image data, sends optional Responses vision and returns *observations only* with uncertainty. API never returns prices or automatically approves image-derived scope. Python mocked provider and Swift syntax/privacy tests passed.
- PR #60: protected per-job **unfinished estimating draft** saved and restored (editable work items, quantities, private labor/material assumptions, rates, unknowns, exclusions, OH/profit). Existing SwiftData approved-estimate persistence and customer PDF only-on-approval retained. Native syntax/privacy tests passed.
- PR #61: local protected blueprint PDF import (one job PDF up to 15 MB); optional AI observation on a raster image of **page 1 only** with explicit consent. No automatic takeoff or calibrated dimensions. Swift syntax/privacy checks passed.
- PR #62: Swift review editor now includes equipment cost per unit and sends it to backend deterministic math with labor/materials/OH/profit. Old saved drafts decode with optional equipment field. Backend and all native CI checks passed.

## Current limitations — must not claim complete
- **No full iPhone Xcode build/simulator XCTest or physical device acceptance conducted for these merges.** GitHub Linux Swift parser checks are useful, but are not iOS compilation or device QA.
- **Visual parity pending**: native SwiftUI screens still need to recreate the design and complete five-stage Job/Scope/Price/Send/Follow-up experience of `mobile/App.tsx`.
- **AI not live**: Render previously shown running November 16 deploy; PR #54/#55 and PR #59 backend improvements have not been verified deployed. `OPENAI_API_KEY` was intentionally absent due to billing. Until a consented, funded provider key and Render update exist, photo and general AI interpretation requests will fail safely and no paid AI is called.
- **Onboarding not verified**: Supabase hosted development project had zero auth users and zero org memberships in last audit. Swift anonymous session approach and Expo email OTP differ; business ownership + real first signup must be tested and reconciled. Never silently merge user IDs.
- **Photo/blueprint scope**: user must review observations and manually confirm; no auto appending observations to priced tasks. No multi-page blueprint interpretation or scale-verified quantities. Client-only PDF never includes private photos, raw notes, analysis or cost breakdown.
- **Pricing catalog incomplete**: 1,674 staged references were not approved customer sell rates; contractor-origin costs still required. No live Home Depot/Lowe's price feed or blanket all-trades pricing approval.
- **TestFlight not published**: Apple paid developer membership was reported held by Derek, but app ID/team signing and external beta distribution remain unverified. Do not overwrite an existing app bundle ID or erase legacy Expo drafts.

## Native acceptance next
1. On Derek's Mac with Apple toolchain and controlled dev account: generate Xcode project from `ios/project.yml`, run all `ContractorOfficeProTests` and `ContractorOfficeProUITests`, compile an independent build in Swift on simulator and device. Keep old Expo app installed separately to preserve data.
2. Match the familiar Expo five-stage UI and bilingual copy in SwiftUI without losing native speech/drafts/photos/PDF.
3. Configure a real test contractor session, deploy the latest approved `backend/` on Render via existing safe staged deployment workflow, verify signed-in `/v1/account/bootstrap`, photo opt-in, interpreting and pricing.
4. Verify an actual English/Spanish job with voice, photos, PDF blueprints, missing information, reviewed work items, equipment/material/labor price, overhead/profit, private draft recovery, contractor approval, and customer PDF. Repeat across painting, plumbing, concrete, bathrooms and kitchens; not only electrical.
5. Only after complete signed-build QA, use Derek's Apple developer team to distribute a TestFlight external beta. Require consent for job photos, no invented rates and explicit preliminary pricing disclosures.

## Product guarantee
**AI observes, extracts and suggests. Deterministic pricing calculates. A real contractor reviews and approves.** Prices or dimensions unsupported by verified data must remain missing or provisional.
