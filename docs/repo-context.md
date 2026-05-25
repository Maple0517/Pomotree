# Pomotree Repo Context

## Confirmed stack

- Framework: Next.js 16 App Router
- Language: TypeScript with `strict` enabled
- Styling: Tailwind CSS v4 via `@tailwindcss/postcss`
- Client state: Zustand
- Local persistence: IndexedDB via Dexie v4
- Date/time helpers: UTC ISO strings for persistence; browser local timezone for Today buckets
- Validation: Vitest unit tests and Playwright Chromium E2E tests
- Code intelligence: CodeGraph initialized at `.codegraph/`; use `/Users/maple/.codegraph/versions/v0.9.4/bin/codegraph sync .` and `status .`

## Design-doc phase status

| Phase | Status | Notes |
|---|---|---|
| Phase 0: Repo validation | Done | Next App Router, TS strict, Tailwind, Zustand, Dexie, lint/build/test/e2e confirmed. |
| Phase 1: Core types and DB | Done | Domain models, ID/time helpers, Dexie v1 schema, settings initialization, storage-unavailable handling, validators, and validator tests exist. |
| Phase 2: Task service | Done | Root/subtask/path creation, update, archive, path computation, subtree IDs, move/cycle protection, and task tests exist. |
| Phase 3: Timer/session service | Done | Start, pause, resume, wall-clock math, finish, save, discard, attribution correction, active restore, expiry, and session tests exist. |
| Phase 4: Interruption service | Done | Create/dismiss/done/convert flows are service-backed and tested; capture does not mutate timer state. |
| Phase 5: Stats/selectors | Done | Local-day helper, Today stats, focus time, task aggregate count/time, subtree aggregation, and boundary tests exist. |
| Phase 6: State/store layer | Done | Zustand store wraps service calls and refreshes snapshots; UI does not write Dexie directly. |
| Phase 7: Dashboard UI | Done for MVP | Dashboard shell, task tree, start/running/pause/finishing panels, attribution selectors, interruptions, Today panel, recent-session attribution correction, labels, and keyboard-native controls exist. |
| Phase 8: Recovery and E2E | Done | Active recovery, expired running restore, corrupt fail-safe, storage-unavailable warning, and Playwright coverage exist. |
| Phase 9: Settings/export | Done | Default duration, theme, browser notifications, JSON export/import restore, and tests exist. |

## Implemented MVP capabilities

- Local-only IndexedDB persistence with Dexie schema version 1.
- Create root tasks, subtasks, and slash-delimited task paths.
- Render/edit/move/archive task tree with cycle protection and history-preserving archive semantics.
- Start focus sessions from a task or from an unassigned intention.
- Support default focus durations and custom per-session durations.
- Run, pause, resume, discard, request finish, and save completed/partial sessions.
- Derive timer display from wall-clock timestamps and persisted pauses.
- Auto-transition expired running timers into `finishing` and preserve in-page finishing as the primary alert.
- Optional browser notification on timer expiry when the user enables it and grants permission.
- End-of-session summary, task attribution correction, and optional mark-attributed-task-done.
- Post-save recent-session attribution correction for completed/partial sessions.
- Interruption capture, dismiss, mark done, and convert-to-task flows.
- Today completed/partial/focus-time/open-interruption stats using browser local-day boundaries.
- Task aggregate focus count/time by subtree.
- Active-session recovery for refresh/reopen, including duplicate/corrupt fail-safe behavior.
- User-visible storage-unavailable warnings.
- JSON export/import with schema version 1 and referential validation.

## Test coverage snapshot

Current verified gates:

- `npm run lint`
- `npm run build`
- `npm run test` (`28` tests)
- `npm run e2e` (`12` tests)

Coverage includes the design-doc test matrix items T001-T030 through unit, integration-style service tests, and Playwright E2E flows.

## Deferred / not in MVP

- Account/login and cloud sync.
- Team collaboration.
- Native macOS/menu-bar app.
- AI follow-up extraction.
- Drag-and-drop task ordering.
- Recurring tasks, deadlines, priority, labels, and complex filtering.
- Full analytics dashboard beyond Today/task aggregate stats.
- Command palette.
- Markdown summary rendering.
- Manual session time editing.
- Break timer automation.
- PWA install.
- Schema v2 migrations; current schema remains v1.

## Operational notes

- Use `http://localhost:3001/` for local E2E/dev-server verification in this workspace.
- Playwright isolates IndexedDB by setting `localStorage["pomotree-db-name"]` before page load.
- `.codegraph/`, `.next/`, `node_modules/`, `test-results/`, and Playwright reports should stay local/ignored.
