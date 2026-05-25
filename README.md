# Pomotree

Pomotree is a local-first task Pomodoro app. The MVP follows the implementation-ready design doc in `/Users/maple/Downloads/focus_tree_implementation_ready_design_doc.md`.

## Current capabilities

- Create root tasks, subtasks, and slash-delimited task paths locally.
- Render and edit a task tree with safe move/cycle protection and archive-preserved history.
- Start a focus session from a task or an unassigned intention.
- Support default and custom focus durations.
- Pause and resume with persisted pause records and wall-clock recovery.
- Automatically enter the required `finishing` state when a running timer expires.
- Save as completed or partial, mark the attributed task done, or discard.
- Correct end-of-session task attribution while preserving the original attribution snapshot.
- Capture interruptions without mutating timer state and convert them into tasks.
- Show Today stats, recent sessions, and subtree task focus totals.
- Persist all data locally in IndexedDB via Dexie.
- Export and import Pomotree JSON with schema version 1.
- Surface storage-unavailable and active-session recovery warnings in the UI.

## Development

```bash
npm run dev
npm run lint
npm run build
npm run test
npm run e2e
```

## Validation

The current MVP is covered by Vitest service/unit tests and Playwright E2E tests. Use `http://localhost:3001/` for local browser verification in this workspace.

## Repo notes

See `docs/repo-context.md` for implementation status, confirmed stack choices, and deferred design-doc items.
