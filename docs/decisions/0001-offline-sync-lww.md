# ADR 0001 — Offline-first sync with last-write-wins

Date: 2026-11-06 · Status: accepted

## Context
Capture and estimate edits must work without signal (CLAUDE.md principle 2). Phase 0 is one user on one or two devices.

## Decision
- SwiftData is the source of truth on device. Every row gets its UUID on device, so records can be created offline.
- Each row carries `updated_at` (client clock at edit time) and `server_updated_at` (server clock, set by trigger).
- **Push:** rows with `needsSync = true` are upserted in dependency order (org → members → clients → jobs → estimates → line items, …).
- **Server-side LWW:** a `BEFORE UPDATE` trigger drops any update whose `updated_at` is older than the stored row.
- **Pull:** per table, `server_updated_at > lastCursor`. This uses the server clock, so device clock skew can't make us miss rows.
  A pulled row replaces the local row unless the local row is dirty with a newer `updated_at`.
- Deletes are soft (`deleted_at`) so they sync like any other edit. RLS has no DELETE policy.
- Records reference each other by UUID fields (`jobId`), not SwiftData relationships, so each table syncs independently.

## Consequences
- Whole-row LWW: two devices editing different fields of the same row → the later edit wins entirely. Fine for solo use.
  Revisit (per-field timestamps or a CRDT) before crews share records in Phase 5.
- Relies on device clocks being roughly right when picking winners. Acceptable; iOS syncs time via NTP.
