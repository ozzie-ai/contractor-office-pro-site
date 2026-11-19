# ADR 0006 — Unite existing client capabilities behind one contractor platform

Date: 2026-11-16 · Status: team direction accepted; technical parity pending

## Context
ADR 0002 selected the team's Expo client and parked Swift. ADR 0003 later unilaterally selected a native-only Swift client. The user explicitly requested neither stack be discarded merely due to device/platform choice. The installed iPhone app is the development test surface, not a decision to make the product iPhone-only. We also have a real Supabase development project and a separate Render backend.

## Decision
- **One product, one backend and business pricing domain**, with shared organization/RLS and unit-price rules.
- Keep the **working Expo / React Native client** as the current user-tested UX baseline while preserving its potential Android path.
- Preserve Derek's **native Swift project** source and assess its differentiated features: on-device bilingual speech, SwiftData sync, organized client/jobs, approved PDF. Reuse after compatibility and device QA, not as an automatic UI replacement.
- Keep the legacy static website separately as a historical prototype, never as a substitute for mobile tests.
- Require user and organization identity interoperability before sync; protect existing local drafts and client documents.
- Treat paid Apple developer capabilities, backend hosting and OpenAI billing as **independent**; don't infer publication or start paid services from source code.
- Record independently the current GitHub branch, Render-deployed commit, and real iPhone build under test.

This supersedes conflicting client-selection portions of ADR 0002 and ADR 0003, **without deleting their history**. The final release client stack remains subject to actual tests and user choice.

## Consequences
- Retaining `ios/` in the common repository is a preservation and audit step, **not** proof it has been merged into the current Expo runtime.
- Expo and Swift should use the same typed API/OpenAPI contracts, org-bound auth and ratebook policies, rather than maintain contradictory estimating algorithms.
- Do not rush into a second installed app. First fix backend version, test signed-in pricing on current iPhone and maintain its saved data, then evaluate native features deliberately.
