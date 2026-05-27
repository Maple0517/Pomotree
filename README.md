# Pomotree

Pomotree is a local-first task Pomodoro app with a focus-tree workflow, interruption capture, and a native macOS menu-bar shell. The core product follows `docs/focus_tree_implementation_ready_design_doc.md`; current implementation status lives in `docs/repo-context.md`.

## Current capabilities

- Create root tasks, subtasks, and slash-delimited task paths locally.
- Render and edit a compact task tree with safe move/cycle protection and archive-preserved history.
- Start a focus session from a task or from an unassigned intention.
- Support default, 25-minute, 50-minute, and custom focus durations.
- Pause and resume with persisted pause records and wall-clock recovery.
- Automatically enter the required `finishing` state when a running timer expires.
- Save as completed or partial, mark the attributed task done, or discard.
- Correct end-of-session and recent-session task attribution while preserving original attribution snapshots.
- Capture interruptions without mutating timer state and convert interruptions into tasks.
- Show Today stats, recent sessions, and subtree task focus totals.
- Persist all data locally in IndexedDB via Dexie.
- Export and import Pomotree JSON with schema version 1.
- Surface storage-unavailable and active-session recovery warnings in the UI.
- Run as a Tauri v2 macOS app with a tray/menu-bar popover and an optional dashboard window.

## Architecture

- `src/app/page.tsx` is the full dashboard UI.
- `src/app/menubar/page.tsx` and `src/app/menubar/MenubarApp.tsx` are the compact menu-bar UI.
- `src/lib/services/pomotree.ts` owns task/session/interruption/settings/import-export write flows and Dexie transaction boundaries.
- `src/lib/services/stats.ts` and `src/lib/services/taskSelectors.ts` provide derived read models for UI and tests.
- `src/lib/store/useAppStore.ts` wraps service calls in a Zustand store and refreshes snapshots after mutations.
- `src/lib/db/*` defines Dexie schema/defaults.
- `src/types/domain.ts` and `src/lib/validation/domain.ts` define domain types and import validation.
- `src-tauri/src/lib.rs` owns native tray behavior, popover positioning, dashboard window creation, and tray status updates.

## Development

```bash
npm run dev
npm run lint
npm run build
npm run test
npm run e2e
```

For local browser verification in this workspace, use `http://localhost:3001/` when a dev server is started on port 3001.

## Tauri / macOS app

```bash
npm run tauri:dev
npm run tauri:dev:current
npm run tauri:build
```

- `tauri:dev` starts Next on port 3000 and opens `/menubar` in the native shell.
- `tauri:dev:current` attaches to an already-running `http://localhost:3001/menubar` dev server.
- `tauri:build` runs a static Next export and packages a macOS `.app`.
- The Tauri WebView uses its own local IndexedDB storage, separate from the browser profile.

## Validation

The current app is covered by Vitest service/unit tests and Playwright Chromium E2E tests, including the dashboard flow, storage-unavailable warning, and menubar flow.

## Repo notes

See:

- `docs/repo-context.md` for implementation status, stack choices, architecture, validation, and deferred items.
- `docs/tauri-menubar-spike.md` for native menu-bar behavior and packaging notes.
