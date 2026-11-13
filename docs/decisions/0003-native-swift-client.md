# ADR 0003 — Native Swift app is the client; Derek builds the backend too

Date: 2026-11-12 · Status: accepted · Supersedes 0002

## Context
ADR 0002 parked the Swift app in favor of the team's React Native/Expo pilot. Derek decided against that:
the product's app is native Swift. The team still needs the backend they asked for.

## Decision
- The iOS client is native Swift/SwiftUI/SwiftData in `ios/`. No React Native/Expo in this project.
- Derek builds the backend (Supabase + FastAPI) as a client-agnostic API, so the team's Expo pilot can also test
  against it during the transition.
- LLM and transcription provider: OpenAI, key held only in the backend.
- Phase 0 steps 1–3 (project, schema, SwiftData models) stand. Next: auth, sync, media queue, first screens; then the
  end-to-end electrical estimate loop with the backend.
- The team's pricing-catalog schema and test scenarios are reused (merged into our migrations, not duplicated).

## Consequences
- Android isn't covered by our client. Decide with the team whether that matters for the pilot.
- The team's Expo app becomes a reference/pilot, not the product client. This needs to be agreed with the team.
