# ADR 0002 — Derek builds the backend for the team's Expo app; native Swift app parked

Date: 2026-11-12 · Status: superseded by 0003 (same day)

## Context
The team (ozzie-ai/contractor-office-pro-site) already has a React Native/Expo mobile app, pilot AI endpoints on Vercel,
and a pricing-catalog schema. They asked Derek for the backend: secure AI/transcription endpoints, a multi-trade pricing
service, regional pricing references with sources, real auth, API docs and a dev environment.
Their current pricing is hardcoded per scenario (e.g. a regex sets a 200A panel to $2,100), which doesn't generalize.
Building a second native client here would duplicate their app and split effort.

## Decision
- Derek focuses on the backend: Supabase (auth, Postgres, storage) + a Python FastAPI service.
- The Expo app is the client. The native Swift app in `ios/` (Phase 0 steps 1–3) is parked, not deleted.
- Kept from Phase 0: the Supabase schema (org/RLS/soft deletes) and the "LLMs interpret, code computes" pricing rule.
  It gets merged with the team's pricing catalog.
- Work is coordinated through Issues/PRs on the team repo once Derek is a collaborator.
- First milestone: one reliable end-to-end electrical workflow, then more trades via catalog data.

## Consequences
- Offline-first sync (ADR 0001) is now mainly a mobile-app concern. The LWW guard in the schema still works for any client.
- The LLM provider must be swappable (team uses OpenAI today).
- Open: backend hosting, LLM provider, and who owns which migrations in the shared repo.
