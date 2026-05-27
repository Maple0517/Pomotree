# Pomotree Repo Context

## Confirmed stack

- Framework: Next.js 16 App Router
- Language: TypeScript with `strict` enabled
- Styling: Tailwind CSS v4 via `@tailwindcss/postcss`
- Client state: Zustand
- Local persistence: IndexedDB via Dexie v4
- Native shell: Tauri v2 macOS `.app` with tray/menu-bar integration
- Date/time helpers: UTC ISO strings for persistence; browser local timezone for Today buckets
- Validation: Vitest unit tests and Playwright Chromium E2E tests
- Code intelligence: CodeGraph initialized at `.codegraph/`; use `/Users/maple/.codegraph/versions/v0.9.4/bin/codegraph sync .` and `status .`

## Current architecture map

| Area | Path | Notes |
|---|---|---|
| Dashboard route | `src/app/page.tsx` | Full task tree, timer, interruptions, settings, import/export, stats, and recent-session correction UI. |
| Menubar route | `src/app/menubar/page.tsx`, `src/app/menubar/MenubarApp.tsx` | Compact timer UI for Tauri and browser preview. Supports idle start, running/paused controls, interruption capture, finishing save, dynamic height, and tray title updates. |
| Store layer | `src/lib/store/useAppStore.ts` | Zustand wrapper around service calls; refreshes the app snapshot after writes and surfaces user-visible errors/recovery notices. |
| Write/service layer | `src/lib/services/pomotree.ts` | Owns task/session/interruption/settings/import-export behavior and Dexie transaction boundaries. UI should not write Dexie directly. |
| Read selectors | `src/lib/services/taskSelectors.ts`, `src/lib/services/stats.ts` | Builds task rows, archived roots, auto-expanded ancestors, local-day stats, and subtree focus aggregates. |
| Persistence | `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `src/lib/db/defaults.ts` | Dexie schema version 1, defaults, test DB isolation, and JSON import/export storage shape. |
| Domain/validation | `src/types/domain.ts`, `src/lib/validation/domain.ts` | Domain types plus import/domain invariant validation. |
| Timer helpers | `src/lib/utils/timer.ts`, `src/lib/utils/time.ts` | Wall-clock elapsed/remaining math, clock formatting, ID/time helpers. |
| Tauri shell | `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json` | Tray menu, click-to-toggle popover, window positioning, hide-on-close, dashboard window, and `set_menubar_status` command. |
| Tests | `src/**/*.test.ts`, `tests/e2e/*.spec.ts` | Vitest service/unit coverage and Playwright E2E coverage for dashboard, menubar, and storage warning flows. |

## Design-doc phase status

| Phase | Status | Notes |
|---|---|---|
| Phase 0: Repo validation | Done | Next App Router, TS strict, Tailwind, Zustand, Dexie, lint/build/test/e2e confirmed. |
| Phase 1: Core types and DB | Done | Domain models, ID/time helpers, Dexie v1 schema, settings initialization, storage-unavailable handling, validators, and validator tests exist. |
| Phase 2: Task service | Done | Root/subtask/path creation, update, archive/restore, path computation, subtree IDs, move/cycle protection, and task tests exist. |
| Phase 3: Timer/session service | Done | Start, pause, resume, wall-clock math, finish, save, discard, attribution correction, active restore, expiry, and session tests exist. |
| Phase 4: Interruption service | Done | Create/dismiss/done/convert flows are service-backed and tested; capture does not mutate timer state. |
| Phase 5: Stats/selectors | Done | Local-day helper, Today stats, focus time, task aggregate count/time, subtree aggregation, and boundary tests exist. |
| Phase 6: State/store layer | Done | Zustand store wraps service calls and refreshes snapshots; UI does not write Dexie directly. |
| Phase 7: Dashboard UI | Done for MVP | Dashboard shell, compact collapsible task tree, direct inline subtask creation, Done/Reopen/Archive actions, archived-task panel, start/running/pause/finishing panels, attribution selectors, interruptions, Today panel, recent-session attribution correction, labels, and keyboard-native controls exist. |
| Phase 8: Recovery and E2E | Done | Active recovery, expired running restore, corrupt fail-safe, storage-unavailable warning, and Playwright coverage exist. |
| Phase 9: Settings/export | Done | Default duration, theme, browser notifications, JSON export/import restore, and tests exist. |
| Native menubar spike | Done for v0 | Tauri v2 shell opens `/menubar`, toggles a tray popover, hides on close, supports a dashboard window, updates tray title, and builds via static Next export. |

## Implemented capabilities

- Local-only IndexedDB persistence with Dexie schema version 1.
- Create root tasks, subtasks, and slash-delimited task paths.
- Render compact collapsible task rows with indentation, chevrons, subtree aggregate stats, selection that does not toggle expansion, and keyboard-native buttons/actions.
- Create root tasks, slash-delimited paths, and direct inline subtasks with `parentId` set to the current active task row.
- Top-level task branches default expanded; deeper branches default collapsed; selected-task and active-session paths auto-expand.
- Done tasks remain visible in the active tree with completed styling, can be reopened, and can be archived; Done does not alter history or focus-session records.
- Archived task branches are hidden from the active task tree and shown in a separate Archived Tasks panel; archive/restore preserve history and focus-session records.
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
- App-wide button/select/menu hover states are consistent with task-tree row interactions; compact action menus close on outside click and render above neighboring rows.
- Native Tauri menubar popover for idle/running/paused/finishing focus flows.
- Tray/menu behavior: left-click toggles the popover, `Show Pomotree` reopens it, `Open Dashboard` creates/focuses a dashboard window, and `Quit Pomotree`/Cmd+Q exits.
- Menubar popover behavior: hide-on-close, monitor-aware tray positioning, dynamic content-height sizing, and dynamic tray title text such as remaining time or completion state.

## Test coverage snapshot

Current verified gates from the latest code-reviewed snapshot:

- `npm run lint`
- `npm run build`
- `npm run test` (`41` tests)
- `npm run e2e -- --reporter=line` (`15` tests)

Coverage includes the design-doc test matrix items T001-T030 through unit, integration-style service tests, and Playwright E2E flows.

Additional coverage now includes task-tree selectors, direct subtask lifecycle flows, Done/Reopen/Archive semantics, collapsed-tree auto-expansion behavior, archived-branch restore, legacy archived finishing-session handling, storage-unavailable UI, and menubar idle/start/interruption/pause/resume/finish/save flow.

## Deferred / not in MVP

- Account/login and cloud sync.
- Team collaboration.
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
- Tauri app signing/notarization, auto-update, and cross-device backup/sync.
- Advanced native menubar features such as global shortcuts, sound/haptics, and rich tray menus.

## Operational notes

- Use `http://localhost:3001/` for local E2E/dev-server verification in this workspace.
- Playwright isolates IndexedDB by setting `localStorage["pomotree-db-name"]` before page load.
- Tauri dev default uses `http://localhost:3000/menubar`; `npm run tauri:dev:current` attaches to `http://localhost:3001/menubar`.
- Production Tauri packaging uses `NEXT_OUTPUT=export npm run build` and `src-tauri/tauri.conf.json` `frontendDist: ../out`.
- Browser and Tauri WebView storage are separate IndexedDB profiles.
- `.codegraph/`, `.next/`, `node_modules/`, `out/`, `src-tauri/target/`, `test-results/`, and Playwright reports should stay local/ignored.
