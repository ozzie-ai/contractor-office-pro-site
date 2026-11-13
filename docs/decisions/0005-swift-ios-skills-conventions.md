# ADR 0005 — iOS conventions from swift-ios-skills

Date: 2026-11-12 · Status: accepted

## Context
Derek asked to follow the practices in github.com/dpearson2699/swift-ios-skills. 20 relevant skills are installed
at user level (~/.claude/skills, not committed: the PolyForm Perimeter license restricts redistribution).

## Decision
- **Concurrency:** Approachable Concurrency + Default Actor Isolation = MainActor on our targets (not packages).
  SwiftData models, their protocols/mappings, and pure helpers are `nonisolated`. No `nonisolated(unsafe)` and no
  `@unchecked Sendable` in app code.
- **Architecture:** MV. `SessionStore` and `SyncEngine` are `@Observable` stores; backends are injected through
  `AccountClient` and `SyncTransport` protocols. `FakeBackend` (DEBUG) implements both for previews and tests.
- **Lifecycle:** async work starts from `.task` (`RootView` → `session.start()`, `HomeView` → `sync.run()`).
- **Localization:** stable manual keys in `Localizable.xcstrings` (format 1.1) with generated symbols
  (`Text(.homeWelcome)`), so a missing key is a compile error. Plurals via catalog variations.
- **SwiftData:** `SchemaV1` + `AppMigrationPlan` from day one; every schema change adds a version and stage.
- **Tests:** Swift Testing (`@Test`, `#expect`, `#require`). Live Supabase test gated by `LIVE_SUPABASE=1`.
- **Previews:** deterministic fixtures in `PreviewData` (first launch, ready, offline/Spanish).

## Consequences
- New strings must be added to the catalog first (manual key), then used via the generated symbol.
- Sync still runs on the main context; move it to a `@ModelActor` if data volume makes the UI hitch.
