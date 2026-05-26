# Focus Tree / Task Pomodoro — Implementation-Ready Design Doc Review + Spec

## 0. Scope of This Revision

This document does six things:

1. Reviews the existing product/design doc for implementation readiness.
2. Converts the current design into an implementation-ready spec.
3. Strengthens core invariants and maps each invariant to tests.
4. Recommends a tighter MVP v1/v2 scope split.
5. Produces a Codex-ready implementation task list.
6. Lists exact markdown sections to add or replace in the original design doc.

This is not a final approval. It is a stronger authoring draft that still needs repo validation.

---

## 1. Implementation-Readiness Review

### 1.1 What is already strong

| Area | Assessment |
|---|---|
| Product problem | Clear. The doc differentiates this product from a plain timer and from a full project management tool. |
| Core workflow | Strong. The loop from task → focus → interruption capture → summary → attribution correction → history is coherent. |
| MVP boundaries | Mostly strong. Team collaboration, sync, native macOS, recurrence, complex reporting, and AI planning are correctly out of MVP. |
| Data model | Good first draft. Task, FocusSession, TimerPause, Interruption, and UserSettings cover the core workflow. |
| Timer edge cases | Good direction. The doc already says to calculate from wall-clock timestamps, not interval ticks. |
| Milestones | Useful. They map to buildable increments. |

### 1.2 Main gaps before implementation

| Gap | Why it matters | Recommended fix |
|---|---|---|
| Existing repo context is missing | Without repo facts, file paths, storage conventions, state management, and test framework are assumptions. | Add a repo context section with confirmed files, current app structure, package manager, test framework, and UI conventions. |
| Active session invariant is too narrow | Current wording only mentions running/paused. `finishing` should also block new focus sessions, otherwise users can have unfinished historical facts. | Define active/non-terminal statuses as `running`, `paused`, and `finishing`. Persist only one at a time. |
| Snapshot semantics are ambiguous | The doc says sessions preserve history, but also says attribution correction updates `taskPathSnapshot`. This can conflict with “what was planned” vs “what was actually done.” | Use two snapshots: `originalTaskPathSnapshot` for start-time assignment and `taskPathSnapshot` for final actual attribution at save/correction time. |
| Transaction boundaries are not specified | IndexedDB writes can partially fail unless grouped. Timer/session/pause writes need atomicity. | Define service methods and Dexie transaction scope for each write path. |
| Task tree safety rules are missing | Moving tasks can create cycles; archiving parents can produce confusing stats. | Add invariants for acyclic trees, safe archive, and subtree aggregation. |
| Timezone rules are underspecified | “Today” metrics can be wrong around midnight or travel. | Store UTC timestamps; calculate day buckets using user/browser local timezone for MVP. |
| Test plan is too generic | It lists categories but not a matrix connecting tests to invariants. | Add invariant-based test matrix. |
| Migration/rollback is too light | IndexedDB schema versioning and rollback behavior are important even in MVP. | Add schema version plan and corruption recovery plan. |
| Decision ledger is absent | Several product tradeoffs are already decided and should not be re-opened. | Add DEC/RISK/DEF entries. |

### 1.3 Readiness verdict

**Current state: Product-design ready, not implementation-ready.**

The document is strong enough to align product direction. It still needs the sections below before it can be handed to Codex or an engineer as a build spec.

---

## 2. Recommended MVP Scope

### 2.1 MVP v1: Core daily loop

V1 should prove the product’s core value with the smallest reliable implementation.

#### Must support

1. Local-only IndexedDB persistence.
2. Create root tasks and subtasks.
3. Render task tree.
4. Start a focus session from a task.
5. Start a focus session from natural-language intention without a task.
6. Support 25m, 50m, and custom planned durations.
7. Running, paused, finishing, completed, partial, and discarded session behavior.
8. Wall-clock timer recovery after refresh/reopen.
9. End-of-session summary.
10. End-of-session task attribution correction.
11. Running-session interruption capture.
12. Today panel with completed/partial sessions and open interruptions.
13. Task aggregate focus count/time by subtree.
14. Basic settings for default duration and JSON export.

#### V1 non-goals

1. Account/login.
2. Cloud sync.
3. Team collaboration.
4. Native macOS app.
5. AI extraction of follow-up tasks.
6. Drag-and-drop task ordering.
7. Recurring tasks.
8. Deadline/priority/labels.
9. Full analytics dashboard.
10. Browser notification dependency. In-page finishing state must be primary.
11. Command palette unless the dashboard loop is already stable.
12. Markdown summary rendering.
13. Manual session time editing.
14. Break timer automation.

### 2.2 V2 candidates

1. Command palette.
2. Browser notifications.
3. Today review route separate from dashboard.
4. Interruption snooze.
5. Manual session time correction.
6. Basic import/export restore.
7. PWA install.
8. Task drag/drop ordering.

### 2.3 V3+ candidates

1. Cloud backup/sync.
2. Supabase/Postgres backend.
3. Local-first sync with conflict handling.
4. Native macOS menu bar app.
5. AI follow-up extraction.
6. Long-term trends and analytics.

---

## 3. Existing Repo Context

### 3.1 Confirmed from the current design doc

| Area | Confirmed design intent |
|---|---|
| Target platform | Web first; future macOS menu bar app. |
| Recommended stack | Next.js, React, TypeScript, Tailwind, Zustand or Jotai, IndexedDB + Dexie, date-fns. |
| Suggested modules | `timer`, `tasks`, `sessions`, `interruptions`, `stats`. |
| Storage tables | `tasks`, `focusSessions`, `timerPauses`, `interruptions`, `userSettings`. |
| MVP persistence | Local IndexedDB. |
| Sync | Explicitly deferred. |
| Timer strategy | Use wall-clock timestamps, not interval tick counts. |

### 3.2 Assumptions to verify in repo

These are not confirmed until the actual repository is inspected.

| ID | Assumption | Impact if false |
|---|---|---|
| A-001 | The app is a Next.js App Router project. | File paths and routing tasks change. |
| A-002 | TypeScript strict mode is enabled or acceptable. | Model and service signatures may need adjustments. |
| A-003 | Dexie is acceptable for IndexedDB. | Storage service implementation changes. |
| A-004 | Zustand is acceptable for client state. | Store implementation changes if Jotai/Redux is used. |
| A-005 | Tests can use Vitest + React Testing Library + Playwright. | Test task list needs framework substitution. |
| A-006 | No existing auth or backend is required for MVP. | Data ownership and sync behavior must be redesigned. |
| A-007 | Single browser profile / single local user is acceptable. | User/workspace IDs can be deferred. |

### 3.3 Files to inspect first

Use this checklist once the repo is available.

```text
package.json
next.config.*
tsconfig.json
app/** or pages/**
src/**
components/**
lib/**
features/**
store/**
test setup files
existing IndexedDB/localStorage usage
existing UI component library usage
```

---

## 4. Data Model Spec

### 4.1 Common fields

All persisted records should use string IDs and ISO timestamp strings.

```ts
type ISODateTimeString = string;
type EntityId = string;
```

For MVP, timestamps should be stored as UTC ISO strings. Day grouping should be computed in the user/browser local timezone.

### 4.2 Task

```ts
type TaskStatus = "todo" | "active" | "done" | "archived";

interface Task {
  id: EntityId;
  parentId: EntityId | null;

  title: string;
  description?: string;

  status: TaskStatus;
  sortOrder: number;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  completedAt?: ISODateTimeString | null;
  archivedAt?: ISODateTimeString | null;
}
```

#### Constraints

1. `title.trim().length > 0`.
2. `parentId` must be either `null` or an existing non-archived/non-deleted task at creation time.
3. Task tree must remain acyclic.
4. `completedAt` must be non-null only when `status = "done"`.
5. `archivedAt` must be non-null only when `status = "archived"`.

### 4.3 FocusSession

```ts
type FocusSessionStatus =
  | "running"
  | "paused"
  | "finishing"
  | "completed"
  | "partial"
  | "discarded";

interface FocusSession {
  id: EntityId;

  taskId: EntityId | null;
  originalTaskId: EntityId | null;

  taskPathSnapshot: string | null;
  originalTaskPathSnapshot: string | null;

  intention: string | null;
  summary: string | null;

  plannedSeconds: number;
  actualSeconds: number;

  status: FocusSessionStatus;

  startedAt: ISODateTimeString;
  endedAt: ISODateTimeString | null;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
```

#### Status definitions

| Status | Meaning | Counts in stats? | Blocks new session? |
|---|---|---:|---:|
| `running` | Timer is actively counting down. | No, until finalized. | Yes |
| `paused` | Timer is paused with an open pause record. | No, until finalized. | Yes |
| `finishing` | Planned time reached or user requested finish; waiting for summary/attribution. | No, until saved as completed/partial. | Yes |
| `completed` | Finalized full focus session. | Yes, complete count + time. | No |
| `partial` | Finalized short focus session. | Time yes; full pomodoro count no. | No |
| `discarded` | User discarded the session. | No. | No |

#### Constraints

1. `plannedSeconds > 0`.
2. `actualSeconds >= 0`.
3. `taskId !== null || intention.trim().length > 0` at start.
4. At most one session can have status in `running | paused | finishing`.
5. `endedAt` must be non-null for `completed`, `partial`, and `discarded`.
6. `summary` may be empty/null for MVP, but the UI must prompt for it.
7. `originalTaskId` and `originalTaskPathSnapshot` are set at start and never changed.
8. `taskId` and `taskPathSnapshot` represent final actual attribution and may be changed during finishing or attribution correction.

### 4.4 TimerPause

```ts
interface TimerPause {
  id: EntityId;
  sessionId: EntityId;

  reason?: "water" | "message" | "break" | "other" | null;

  startedAt: ISODateTimeString;
  endedAt: ISODateTimeString | null;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
```

#### Constraints

1. `sessionId` must reference a FocusSession.
2. A session may have at most one open pause where `endedAt = null`.
3. Open pause is only valid when the session status is `paused`.
4. Closed pauses must have `endedAt >= startedAt`.

### 4.5 Interruption

```ts
type InterruptionStatus = "open" | "converted" | "dismissed" | "done" | "snoozed";

interface Interruption {
  id: EntityId;

  sessionId: EntityId | null;
  taskId: EntityId | null;

  text: string;
  status: InterruptionStatus;

  convertedToTaskId?: EntityId | null;
  snoozedUntil?: ISODateTimeString | null;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
```

#### Constraints

1. `text.trim().length > 0`.
2. Creating an interruption must not change timer/session status.
3. If `status = "converted"`, `convertedToTaskId` must be non-null.
4. If `status !== "converted"`, `convertedToTaskId` should be null.
5. If `status = "snoozed"`, `snoozedUntil` must be non-null.

### 4.6 UserSettings

```ts
interface UserSettings {
  id: "local";

  defaultFocusSeconds: number;
  defaultBreakSeconds: number;

  enableNotifications: boolean;
  theme: "light" | "dark" | "system";

  autoStartBreak: boolean;
  autoStartNextFocus: boolean;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
```

#### MVP default settings

```ts
const DEFAULT_SETTINGS: UserSettings = {
  id: "local",
  defaultFocusSeconds: 25 * 60,
  defaultBreakSeconds: 5 * 60,
  enableNotifications: false,
  theme: "system",
  autoStartBreak: false,
  autoStartNextFocus: false,
  createdAt: nowIso,
  updatedAt: nowIso,
};
```

### 4.7 Dexie schema

```ts
db.version(1).stores({
  tasks: "id, parentId, status, sortOrder, createdAt, updatedAt, completedAt, archivedAt",
  focusSessions: "id, taskId, originalTaskId, status, startedAt, endedAt, createdAt, updatedAt",
  timerPauses: "id, sessionId, startedAt, endedAt",
  interruptions: "id, sessionId, taskId, status, convertedToTaskId, createdAt, updatedAt",
  userSettings: "id"
});
```

---

## 5. Core Invariants

### INV-001: At most one non-terminal focus session

**Rule**

At most one FocusSession may have `status in ["running", "paused", "finishing"]`.

**Why it matters**

The product is a single-focus timer. Multiple active sessions would corrupt timer UI, recovery, and daily stats.

**Enforced by**

- Database constraint: N/A in IndexedDB.
- Service validation: `startFocus`, `restoreActiveSession`, `requestFinish`, `saveFinish`.
- UI validation: disable start controls while an active/non-terminal session exists.
- Tests: T001, T002, T011.

**Failure example**

User starts a second 25m focus while the first is still in finishing; both later count in stats.

---

### INV-002: A session must have either a task or an intention

**Rule**

A FocusSession cannot be started unless `taskId !== null` or `intention.trim().length > 0`.

**Why it matters**

A session with no task and no intention is not useful history and cannot be meaningfully reviewed.

**Enforced by**

- Service validation: `startFocus`.
- UI validation: start button disabled until task or intention is present.
- Tests: T003.

---

### INV-003: Timer math is wall-clock based

**Rule**

Remaining time and `actualSeconds` must be computed from `startedAt`, current/ended wall-clock time, and closed/open `TimerPause` records. UI interval ticks must never be the source of truth.

**Why it matters**

Browser timers are unreliable in background tabs and after refresh.

**Enforced by**

- Service validation: `computeElapsedSeconds`, `computeRemainingSeconds`.
- UI behavior: `setInterval` only refreshes display.
- Tests: T004, T005, T012.

---

### INV-004: Pauses are consistent with session state

**Rule**

A session can have at most one open pause. An open pause may exist only while the session is `paused`. Resuming must close that open pause.

**Why it matters**

Overlapping/open pauses corrupt `actualSeconds`.

**Enforced by**

- Service validation: `pauseSession`, `resumeSession`.
- Dexie transaction: session status and pause write/update are atomic.
- Tests: T006, T007.

---

### INV-005: Finishing is mandatory before completed

**Rule**

A running/paused session may not transition directly to `completed`. It must enter `finishing` first, then be saved as `completed` or `partial`.

**Why it matters**

Finishing is where summary and attribution correction happen. Skipping it loses core product value.

**Enforced by**

- Service validation: `requestFinish`, `saveFinish`.
- UI behavior: route/render finishing modal after timer expires or user taps complete.
- Tests: T008, T009.

---

### INV-006: Original attribution is immutable

**Rule**

`originalTaskId` and `originalTaskPathSnapshot` are set when the session starts and never change.

**Why it matters**

They preserve what the user planned at start, enabling future plan-vs-actual analysis.

**Enforced by**

- Service validation: `changeSessionAttribution` may update `taskId` but not `originalTaskId`.
- Tests: T010.

---

### INV-007: Actual attribution snapshot is stable after final save unless explicitly corrected

**Rule**

`taskPathSnapshot` represents the final actual attribution path at save/correction time. Task renames/moves after save must not silently rewrite it.

**Why it matters**

History should remain understandable even if the task tree later changes.

**Enforced by**

- Service validation: `saveFinish`, `changeSessionAttribution` update snapshot only when attribution is explicitly changed.
- Reporting behavior: history displays snapshot, not live path, by default.
- Tests: T010, T017.

---

### INV-008: Task tree must remain acyclic

**Rule**

A task cannot be moved under itself or any of its descendants.

**Why it matters**

Cycles break path computation, subtree aggregation, and rendering.

**Enforced by**

- Service validation: `moveTask`, `createTaskPath`.
- Tests: T018.

---

### INV-009: Task history is protected from archive/delete

**Rule**

Archiving a task must not delete or mutate historical FocusSession records. Hard delete is not supported in MVP.

**Why it matters**

FocusSession is historical fact. Removing a task must not erase time history.

**Enforced by**

- Service behavior: `archiveTask` only updates task status/timestamp.
- UI behavior: archived task label in history if needed.
- Tests: T019.

---

### INV-010: Parent stats are subtree aggregations without double count

**Rule**

For a task T, aggregate stats include sessions where `session.taskId` is T or any descendant of T. A session must be counted at most once per aggregate.

**Why it matters**

Parent task totals must not double count child sessions.

**Enforced by**

- Service/selectors: `getSubtreeTaskIds`, `getTaskStats`.
- Tests: T020, T021.

---

### INV-011: Partial sessions count as time, not full pomodoros

**Rule**

`partial` sessions contribute to focus time but not completed pomodoro count. `discarded` sessions contribute to neither.

**Why it matters**

This preserves honest reporting while allowing users to keep short-focus records.

**Enforced by**

- Stats service/selectors.
- Tests: T022.

---

### INV-012: Interruption capture does not affect timer state

**Rule**

Creating an interruption must not pause, resume, finish, discard, or otherwise mutate the active session.

**Why it matters**

The interruption inbox exists to avoid context switching.

**Enforced by**

- Service transaction: write interruption only.
- UI behavior: input clears after save; timer continues.
- Tests: T023.

---

### INV-013: Converted interruption has exactly one target task

**Rule**

If an interruption is converted, it must point to exactly one created/existing task through `convertedToTaskId`.

**Why it matters**

Users need a reliable path from captured thought to task tree.

**Enforced by**

- Service validation: `convertInterruptionToTask`.
- Dexie transaction: task creation and interruption update are atomic.
- Tests: T024.

---

### INV-014: Today stats use one timezone boundary consistently

**Rule**

All “today” calculations use the same local-day boundary derived from the user/browser timezone at calculation time.

**Why it matters**

Daily review must not split or duplicate sessions inconsistently around midnight.

**Enforced by**

- Stats service: `getLocalDayRange(now)`.
- Tests: T025.

---

### INV-015: Corrupt active session recovery must fail safe

**Rule**

If the app cannot restore an active session due to missing/invalid data, it must not crash or create a second active session. It must mark the session `partial` or `discarded` and show a recovery notice.

**Why it matters**

Local-first storage can be corrupted or partially cleared.

**Enforced by**

- Service behavior: `restoreActiveSession`.
- UI behavior: recovery notice.
- Tests: T026.

---

## 6. Service Layer Behavior

### 6.1 Service conventions

All write services must:

1. Generate IDs in service layer.
2. Set `createdAt` and `updatedAt` consistently.
3. Run validation before writes.
4. Use Dexie transactions for multi-table writes.
5. Return the updated canonical entity/entities.
6. Never rely on UI state as source of truth.

### 6.2 `createTask(input)`

```ts
interface CreateTaskInput {
  title: string;
  parentId?: EntityId | null;
}
```

**Validation**

- `title.trim()` must be non-empty.
- `parentId`, if provided, must exist and not be archived.

**Write steps**

1. Normalize title.
2. Load sibling tasks for `sortOrder`.
3. Create Task with `status = "todo"`.
4. Persist task.

**Failure behavior**

- Throw validation error; no writes.

### 6.3 `createTaskPath(path)`

```ts
interface CreateTaskPathInput {
  path: string;
  parentId?: EntityId | null;
}
```

**Validation**

- Split path by `/`.
- Trim each segment.
- Reject empty segments.

**Write steps**

1. Start from `parentId ?? null`.
2. For each segment, find existing sibling task by normalized title.
3. If found, descend into it.
4. If not found, create it.
5. Return final leaf task.

**Transaction boundary**

- All path segment creations must be atomic.

### 6.4 `startFocus(input)`

```ts
interface StartFocusInput {
  taskId: EntityId | null;
  intention: string | null;
  plannedSeconds: number;
}
```

**Validation**

- No existing `running | paused | finishing` session.
- `plannedSeconds > 0`.
- `taskId !== null || intention.trim().length > 0`.
- If taskId exists, task must not be archived.

**Write steps**

1. Load active/non-terminal sessions.
2. Load task and compute path if `taskId` is present.
3. Create FocusSession:
   - `status = "running"`
   - `taskId = input.taskId`
   - `originalTaskId = input.taskId`
   - `taskPathSnapshot = current path or null`
   - `originalTaskPathSnapshot = current path or null`
   - `actualSeconds = 0`
   - `startedAt = now`
   - `endedAt = null`
4. Persist session.

### 6.5 `pauseSession(sessionId, reason?)`

**Validation**

- Session exists and status is `running`.
- No existing open pause for session.

**Write steps**

1. Create TimerPause with `startedAt = now`, `endedAt = null`.
2. Update FocusSession status to `paused`.

**Transaction boundary**

- Session update and pause creation are atomic.

### 6.6 `resumeSession(sessionId)`

**Validation**

- Session exists and status is `paused`.
- Exactly one open pause exists.

**Write steps**

1. Set open pause `endedAt = now`.
2. Update FocusSession status to `running`.

**Transaction boundary**

- Pause update and session update are atomic.

### 6.7 `requestFinish(sessionId)`

**Purpose**

Move a running/paused session into finishing when timer expires or user taps complete.

**Validation**

- Session status is `running` or `paused`.

**Write steps**

1. If paused, close any open pause with `endedAt = now`.
2. Compute `actualSeconds` from wall-clock and pauses.
3. Set status to `finishing`.
4. Keep `endedAt = null` until final save.

**Note**

For early completion, `actualSeconds` may be less than `plannedSeconds`; final save can still choose `completed` or `partial` based on user action/business rule.

### 6.8 `saveFinish(input)`

```ts
interface FinishSessionInput {
  sessionId: EntityId;
  summary: string | null;
  taskId: EntityId | null;
  finalStatus: "completed" | "partial";
  markTaskDone?: boolean;
}
```

**Validation**

- Session status is `finishing`.
- `finalStatus` is `completed` or `partial`.
- Final session must still have either `taskId` or `intention`.
- If `taskId` exists, task exists and is not archived.

**Write steps**

1. Load session.
2. Compute final task path snapshot from `taskId`.
3. Update session:
   - `summary`
   - `taskId`
   - `taskPathSnapshot`
   - `status = finalStatus`
   - `actualSeconds = recomputed actual seconds`
   - `endedAt = now`
4. If `markTaskDone`, update task to `done` with `completedAt = now`.

**Transaction boundary**

- Session update and optional task update are atomic.

### 6.9 `discardSession(sessionId, mode)`

```ts
type DiscardMode = "savePartial" | "discard";
```

**Validation**

- Session status is `running`, `paused`, or `finishing`.

**Write steps**

1. Close open pause if any.
2. Recompute `actualSeconds`.
3. If `savePartial`, set `status = "partial"` and `endedAt = now`.
4. If `discard`, set `status = "discarded"` and `endedAt = now`.

### 6.10 `changeSessionAttribution(input)`

```ts
interface ChangeSessionAttributionInput {
  sessionId: EntityId;
  taskId: EntityId | null;
}
```

**Validation**

- Session status is `finishing`, `completed`, or `partial`.
- If `taskId` is non-null, task exists.
- Final session must still have either `taskId` or intention.

**Write steps**

1. Load task path if task is present.
2. Update `taskId` and `taskPathSnapshot`.
3. Do not update `originalTaskId` or `originalTaskPathSnapshot`.

### 6.11 `createInterruption(input)`

```ts
interface CreateInterruptionInput {
  text: string;
  sessionId?: EntityId | null;
  taskId?: EntityId | null;
}
```

**Validation**

- `text.trim()` must be non-empty.
- If `sessionId` is present, session must exist.
- If `taskId` is present, task must exist.

**Write steps**

1. Create Interruption with `status = "open"`.
2. Do not update session/timer status.

### 6.12 `convertInterruptionToTask(input)`

```ts
interface ConvertInterruptionToTaskInput {
  interruptionId: EntityId;
  title?: string;
  parentId?: EntityId | null;
  existingTaskId?: EntityId;
}
```

**Validation**

- Interruption exists and status is `open` or `snoozed`.
- Exactly one of `existingTaskId` or `title` is provided.

**Write steps**

1. If `existingTaskId`, validate task exists.
2. Else create a new task with `title ?? interruption.text`.
3. Update interruption:
   - `status = "converted"`
   - `convertedToTaskId = task.id`
4. Return task and updated interruption.

**Transaction boundary**

- Task creation and interruption update are atomic.

### 6.13 `restoreActiveSession(now)`

**Purpose**

Recover persisted timer state after reload/reopen.

**Validation and behavior**

1. Load sessions with status in `running | paused | finishing`.
2. If zero, return idle state.
3. If more than one, keep most recently updated and mark older ones `partial` or `discarded` with recovery notice.
4. If status is `finishing`, return finishing state.
5. If `running` or `paused`, compute elapsed/remaining from wall clock and pauses.
6. If remaining <= 0, update session to `finishing` and return finishing state.
7. Else return running/paused state with derived remaining seconds.

---

## 7. UI Behavior Spec

### 7.1 Dashboard layout

V1 may implement all major surfaces on `/dashboard`:

| Region | Responsibilities |
|---|---|
| Left: Task Tree | Create task/subtask, select task, start focus from task, show subtree aggregate count/time. |
| Center: Focus Timer | Plan/start session, render running/paused/finishing states, capture summary. |
| Right: Today Panel | Show today sessions, open interruptions, quick convert/dismiss actions. |

### 7.2 Empty state

If there are no tasks and no active session:

- Show a single input: “今天想推进什么？”
- Enter creates a root task and selects it.
- Start focus remains possible with free-text intention.

### 7.3 Start behavior

Start button enabled when:

- selected task exists, or
- intention input has non-empty trimmed value.

Start button disabled when:

- any `running | paused | finishing` session exists.

### 7.4 Running behavior

UI displays:

- remaining time derived from selector/service;
- task path or “未归属任务”;
- intention;
- pause, complete, abandon controls;
- interruption input.

Interruption input:

- Enter creates interruption.
- Input clears on success.
- Timer display/state does not change.

### 7.5 Paused behavior

UI displays:

- elapsed focus time excluding pause;
- optional reason selector;
- resume and abandon controls.

### 7.6 Finishing behavior

Finishing modal/panel is blocking for new sessions.

UI displays:

- original intention;
- current/final task attribution selector;
- summary textarea;
- actions: save completed, save partial, discard, add follow-up task, mark task done.

Summary is optional in MVP but the UI should make it visually clear that a summary is valuable.

### 7.7 Attribution correction behavior

The task selector must allow:

- assigning to existing task;
- creating a new task/path;
- unassigning only if intention remains non-empty.

When attribution changes:

- history uses updated actual attribution path;
- original attribution remains available for future analysis/debug.

### 7.8 Today panel behavior

Today panel shows:

1. Completed sessions from local day.
2. Partial sessions from local day.
3. Open interruptions from local day.
4. Optional aggregate summary:
   - completed pomodoros;
   - partial count;
   - total focus time;
   - interruption count.

Discarded sessions are hidden by default.

### 7.9 Accessibility requirements

1. All buttons reachable by Tab.
2. Enter submits task/interruption inputs.
3. Esc closes non-blocking modal; finishing should require explicit save/discard action.
4. Timer status must not rely on color alone.
5. Timer display should have accessible label with remaining time.

---

## 8. Reporting / Aggregation Spec

### 8.1 Local day range

```ts
interface DayRange {
  startInclusive: Date;
  endExclusive: Date;
}
```

For MVP, derive day range from browser local timezone.

### 8.2 Today completed pomodoro count

```text
count sessions where:
  status = completed
  startedAt within local today
```

### 8.3 Today partial count

```text
count sessions where:
  status = partial
  startedAt within local today
```

### 8.4 Today total focus time

```text
sum(actualSeconds) where:
  status in [completed, partial]
  startedAt within local today
```

### 8.5 Task completed pomodoro count

```text
For task T:
  subtreeIds = ids of T + all descendants
  count sessions where:
    status = completed
    taskId in subtreeIds
```

### 8.6 Task total focus time

```text
For task T:
  subtreeIds = ids of T + all descendants
  sum(actualSeconds) where:
    status in [completed, partial]
    taskId in subtreeIds
```

### 8.7 History display path

Default history path:

1. Use `session.taskPathSnapshot` if present.
2. Else if `taskId = null`, show “未归属任务”.
3. If task is archived, still show snapshot and optionally badge “Archived”.

### 8.8 Longest continuous focus

Defer from v1 unless today review requires it. If implemented:

- Use completed/partial sessions sorted by `startedAt`.
- Do not merge across large breaks unless there is an explicit break model.

---

## 9. Sync / Import / Export Behavior

### 9.1 MVP sync

No cloud sync in MVP.

### 9.2 Local export

JSON export should include:

```json
{
  "schemaVersion": 1,
  "exportedAt": "ISO_TIMESTAMP",
  "tasks": [],
  "focusSessions": [],
  "timerPauses": [],
  "interruptions": [],
  "userSettings": {}
}
```

### 9.3 Import

Full import/restore is deferred from v1 unless explicitly required. Export-only is safer for MVP.

### 9.4 Future sync requirements to preserve

Add fields now only if cheap and not confusing:

- `id`
- `createdAt`
- `updatedAt`

Do not add `deletedAt` to every model in v1 unless sync/import is actively implemented. Use `archivedAt` for task archive semantics.

---

## 10. Migration / Rollback Plan

### 10.1 MVP initial schema

Dexie version 1 creates all five tables:

1. tasks
2. focusSessions
3. timerPauses
4. interruptions
5. userSettings

### 10.2 First-run setup

On app start:

1. Open IndexedDB.
2. Ensure default settings row exists.
3. Restore active session.
4. If restore fails, fail safe with recovery notice.

### 10.3 Schema migration rules

Future migrations must:

1. Increment Dexie version.
2. Be additive where possible.
3. Backfill required fields with safe defaults.
4. Avoid deleting historical focus sessions.
5. Include a JSON export before destructive migration if supported.

### 10.4 Rollback plan

For v1 local-only app:

- Code rollback can read version 1 schema.
- If a migration fails, show storage error and offer export raw data if possible.
- Do not attempt automatic destructive cleanup.

### 10.5 Data corruption recovery

If active session is invalid:

1. Try to recompute from available fields.
2. If impossible, mark as `partial` if `startedAt` exists and actual time can be estimated.
3. Otherwise mark as `discarded`.
4. Show user a notice.

---

## 11. Test Matrix

| ID | Scenario | Input / State | Expected Result | Invariant Covered | Test Type |
|---|---|---|---|---|---|
| T001 | Start first focus | No active session, valid task | One running session created | INV-001, INV-002 | Unit/Integration |
| T002 | Block second focus | Existing running session | `startFocus` rejects; no new session | INV-001 | Unit |
| T003 | Reject empty unassigned session | `taskId=null`, `intention=""` | Validation error | INV-002 | Unit |
| T004 | Remaining uses wall clock | Started 10m ago, planned 25m | Remaining 15m | INV-003 | Unit |
| T005 | Pause excluded from elapsed | Started 20m ago, paused 5m | Actual elapsed 15m | INV-003, INV-004 | Unit |
| T006 | Pause creates open pause | Running session | Status paused; one open pause | INV-004 | Integration |
| T007 | Resume closes pause | Paused session with open pause | Status running; pause endedAt set | INV-004 | Integration |
| T008 | Timer expiry enters finishing | Running session elapsed >= planned | Status finishing, not completed | INV-005 | Unit/Integration |
| T009 | Save finish completes session | Finishing session + summary | Status completed; endedAt set | INV-005 | Integration |
| T010 | Attribution correction preserves original | Started on Task A, saved on Task B | `originalTaskId=A`, `taskId=B` | INV-006, INV-007 | Unit/Integration |
| T011 | Finishing blocks new start | One finishing session exists | `startFocus` rejects | INV-001, INV-005 | Unit |
| T012 | Refresh restores running session | Running session persisted | UI restores derived remaining time | INV-003 | E2E |
| T013 | Reopen expired session | Running session elapsed > planned | UI opens finishing state | INV-003, INV-005 | E2E |
| T014 | Discard does not count | Discarded session today | Count/time exclude it | INV-011 | Unit |
| T015 | Save partial counts time only | Partial session actualSeconds=600 | Focus time +600, pomodoro count unchanged | INV-011 | Unit |
| T016 | History path survives rename | Save on Task A, rename A | History still shows saved snapshot | INV-007 | Integration |
| T017 | Explicit correction updates snapshot | Completed session corrected to Task B | History shows Task B snapshot | INV-007 | Integration |
| T018 | Reject cyclic task move | Move parent under child | Validation error | INV-008 | Unit |
| T019 | Archive preserves history | Archive task with sessions | Sessions remain; stats/history safe | INV-009 | Integration |
| T020 | Parent stats include child | Parent P, child C, session on C | P stats include C session | INV-010 | Unit |
| T021 | Parent stats no double count | Session on child only | Parent count increments once | INV-010 | Unit |
| T022 | Mixed status stats | completed, partial, discarded | Correct count/time by status | INV-011 | Unit |
| T023 | Interruption does not pause timer | Running session, create interruption | Session remains running | INV-012 | Integration |
| T024 | Convert interruption atomically | Open interruption converted to new task | Task created; interruption converted | INV-013 | Integration |
| T025 | Today boundary consistency | Sessions around local midnight | Only local-day sessions included | INV-014 | Unit |
| T026 | Corrupt active recovery | Invalid active session data | No crash; fail-safe status + notice | INV-015 | Integration/E2E |
| T027 | IndexedDB unavailable | Storage open fails | User sees warning; app does not crash | INV-015 | E2E |
| T028 | Empty task title rejected | `title="   "` | Validation error; no task | Data constraints | Unit |
| T029 | Path task creation atomic | `A / B / C` | All missing nodes created or none on failure | Atomic writes | Integration |
| T030 | Mark task done with open children | Parent has incomplete children | Parent done; children unchanged | Accepted decision | Integration |

---

## 12. Decision Ledger Updates

### DEC-001: MVP is local-first without login

**Status**

Accepted

**Decision**

MVP stores user data locally in IndexedDB and does not require login.

**Reason**

The core value is the personal daily focus loop. Login and sync add complexity before the workflow is validated.

**Alternatives considered**

1. Require account from day one.
2. Use backend database from day one.

**Why alternatives were rejected**

They increase friction and implementation scope, conflicting with the low-friction start principle.

**Implications**

- Data loss risk exists if browser storage is cleared.
- JSON export should be available early.
- Sync design must be revisited before multi-device release.

**Review instruction**

Do not reopen unless user data loss or multi-device usage becomes a v1 requirement.

---

### DEC-002: Summary is optional in MVP

**Status**

Accepted

**Decision**

The app strongly prompts for summary but allows saving without one.

**Reason**

Forcing summary can make the focus loop feel heavy. The product principle is low-friction start and lightweight finish.

**Implications**

- Reporting must tolerate null/empty summaries.
- UI should still nudge summary entry.

---

### DEC-003: Finishing state blocks new sessions

**Status**

Accepted

**Decision**

A session in `finishing` is non-terminal and blocks starting another session.

**Reason**

The user has not finalized history. Allowing another session creates unfinished records and attribution ambiguity.

**Implications**

- UI must restore finishing state after refresh/reopen.
- Start controls disabled until save/discard.

---

### DEC-004: Original and actual attribution are separate

**Status**

Accepted

**Decision**

Use `originalTaskId/originalTaskPathSnapshot` for start-time plan and `taskId/taskPathSnapshot` for final actual attribution.

**Reason**

This preserves historical truth while allowing correction.

**Implications**

- Attribution correction updates actual attribution only.
- Future analytics can compare planned vs actual.

---

### DEC-005: Parent task may be done while children remain open

**Status**

Accepted

**Decision**

MVP allows marking a parent task done without automatically completing child tasks.

**Reason**

Users may treat parent tasks as phase containers. Strict project-management semantics would be too heavy.

**Implications**

- UI should warn when incomplete children exist.
- Stats continue to aggregate by tree structure regardless of parent status.

---

### DEC-006: Partial sessions count as focus time but not pomodoros

**Status**

Accepted

**Decision**

`partial` sessions contribute to `actualSeconds` totals but not completed pomodoro count.

**Reason**

This preserves useful work history without overstating completed focus blocks.

---

## 13. Risk Ledger Updates

### RISK-001: Browser timer unreliability

**Severity**

P0

**Mitigation**

Use wall-clock timestamps and pause records as source of truth. Use interval only for UI refresh.

**Status**

Mitigated by INV-003.

---

### RISK-002: Local data loss

**Severity**

P1

**Mitigation**

Use IndexedDB, provide JSON export, avoid destructive migrations, and add storage error UI.

**Status**

Open until export is implemented.

---

### RISK-003: Task tree becomes a full todo/project app

**Severity**

P1

**Mitigation**

Keep deadlines, labels, recurrence, priorities, and complex filters out of v1.

**Status**

Accepted.

---

### RISK-004: Snapshot semantics confuse users or developers

**Severity**

P1

**Mitigation**

Separate original and actual attribution. Add tests for rename/move/correction.

**Status**

Mitigated by INV-006 and INV-007.

---

### RISK-005: IndexedDB transactions are not treated as service boundaries

**Severity**

P1

**Mitigation**

All multi-table writes must go through service functions with Dexie transactions.

**Status**

Open until implementation.

---

## 14. Deferred Items

### DEF-001: Cloud sync

**Deferred item**

Supabase/Postgres sync or local-first sync.

**Why safe to defer**

MVP is single-user, local-first, and validates the core workflow.

**When to revisit**

After daily loop retention is validated or when multi-device usage becomes required.

---

### DEF-002: Native macOS menu bar app

**Deferred item**

Menu bar timer and interruption capture.

**Why safe to defer**

Web dashboard is sufficient to validate the workflow.

**When to revisit**

After core timer/session/history model stabilizes.

---

### DEF-003: AI follow-up extraction

**Deferred item**

Automatically extracting tasks from summaries.

**Why safe to defer**

Manual follow-up task creation covers the core behavior without AI complexity.

**When to revisit**

After summary usage is high enough to justify automation.

---

### DEF-004: Command palette

**Deferred item**

Cmd+K actions.

**Why safe to defer**

Nice acceleration layer, not required for the core daily loop.

**When to revisit**

After core dashboard actions are implemented and stable.

---

### DEF-005: Break timer automation

**Deferred item**

Auto-start break and next focus behavior.

**Why safe to defer**

Focus recording is the core product value. Break automation can be added later.

**When to revisit**

After completion/finishing flow feels stable.

---

## 15. Codex-Ready Implementation Task List

### Phase 0: Repo validation

- [ ] Inspect package manager, Next.js structure, TypeScript config, lint/test setup.
- [ ] Confirm whether app uses App Router or Pages Router.
- [ ] Confirm state management preference: Zustand, Jotai, Redux, or existing pattern.
- [ ] Confirm styling/UI component patterns.
- [ ] Confirm whether IndexedDB/Dexie is already installed.
- [ ] Create/update `docs/repo-context.md` with confirmed facts and unknowns.

### Phase 1: Core types and DB

- [ ] Add shared model types for Task, FocusSession, TimerPause, Interruption, UserSettings.
- [ ] Add ID/time helpers.
- [ ] Add Dexie database with version 1 schema.
- [ ] Add settings initialization.
- [ ] Add storage unavailable error handling.
- [ ] Add unit tests for model validators.

### Phase 2: Task service

- [ ] Implement `createTask`.
- [ ] Implement `createTaskPath`.
- [ ] Implement `updateTask`.
- [ ] Implement `archiveTask`.
- [ ] Implement `computeTaskPath`.
- [ ] Implement `getSubtreeTaskIds` with cycle protection.
- [ ] Add tests for root task, subtask, path creation, empty title, cycle rejection, archive preservation.

### Phase 3: Timer/session service

- [ ] Implement `startFocus` with active-session guard.
- [ ] Implement `pauseSession`.
- [ ] Implement `resumeSession`.
- [ ] Implement `computeElapsedSeconds` and `computeRemainingSeconds`.
- [ ] Implement `requestFinish`.
- [ ] Implement `saveFinish`.
- [ ] Implement `discardSession`.
- [ ] Implement `changeSessionAttribution`.
- [ ] Implement `restoreActiveSession`.
- [ ] Add tests for active session, wall-clock math, pause handling, finishing, attribution correction, partial/discarded behavior.

### Phase 4: Interruption service

- [ ] Implement `createInterruption`.
- [ ] Implement `dismissInterruption`.
- [ ] Implement `markInterruptionDone`.
- [ ] Implement `convertInterruptionToTask` with atomic task creation/update.
- [ ] Add tests proving interruption capture does not mutate timer state.

### Phase 5: Stats/selectors

- [ ] Implement local-day boundary helper.
- [ ] Implement today session selectors.
- [ ] Implement today focus time.
- [ ] Implement task aggregate pomodoro count.
- [ ] Implement task aggregate focus time.
- [ ] Add tests for completed/partial/discarded stats and parent subtree aggregation.

### Phase 6: State/store layer

- [ ] Implement timer store around service calls.
- [ ] Implement task store/loaders.
- [ ] Implement interruption store/loaders.
- [ ] Implement derived selectors for dashboard.
- [ ] Ensure UI never directly writes Dexie outside services.

### Phase 7: Dashboard UI

- [ ] Build dashboard three-column shell.
- [ ] Build task tree with create/select/start actions.
- [ ] Build start focus panel.
- [ ] Build running timer panel.
- [ ] Build pause UI.
- [ ] Build finishing modal/panel.
- [ ] Build attribution selector.
- [ ] Build interruption input.
- [ ] Build today panel.
- [ ] Add accessible labels and keyboard behavior.

### Phase 8: Recovery and E2E

- [ ] Restore active session on app load.
- [ ] Handle expired running session by entering finishing.
- [ ] Handle corrupt active session fail-safe.
- [ ] Add Playwright tests for start → finish → history, refresh running, reopen expired, interruption capture, attribution correction.

### Phase 9: Settings/export

- [ ] Implement settings page/modal for default focus duration and theme.
- [ ] Implement JSON export with schema version.
- [ ] Add export test.

---

## 16. Exact Sections to Add or Replace in the Original Design Doc

### 16.1 Replace section 8: Data Model

Replace with the data model spec in sections 4.1–4.7 of this document.

Main changes:

- Remove `planned` from persisted FocusSession status unless there is a concrete planning persistence need.
- Add `finishing` as persisted non-terminal status.
- Make `originalTaskId` required but nullable.
- Clarify original vs actual snapshots.
- Add constraints for every model.

### 16.2 Replace section 9: Timer 状态机

Use this state machine:

```text
idle
  -> running

running
  -> paused
  -> finishing
  -> partial
  -> discarded

paused
  -> running
  -> finishing
  -> partial
  -> discarded

finishing
  -> completed
  -> partial
  -> discarded

completed
  -> idle

partial
  -> idle

discarded
  -> idle
```

Notes:

- `planning` should be UI-only unless persisted planning sessions are required.
- `finishing` is persisted and blocks new sessions.

### 16.3 Replace section 16: 关键业务规则

Replace with section 5 Core Invariants.

### 16.4 Add new section after section 16: Service/API Behavior

Add section 6 Service Layer Behavior.

### 16.5 Replace section 22: 统计计算

Replace with section 8 Reporting / Aggregation Spec.

### 16.6 Replace section 25: 测试计划

Replace with section 11 Test Matrix.

### 16.7 Add new section: Migration / Rollback Plan

Add section 10 Migration / Rollback Plan.

### 16.8 Add new section: Decision / Risk / Deferred Ledger

Add sections 12, 13, and 14.

### 16.9 Add new section near top: Existing Repo Context

Add section 3 Existing Repo Context and update it after repo inspection.

---

## 17. Implementation Readiness Self-Check

| Check | Status | Notes |
|---|---|---|
| Requirements separated from non-goals | Pass | V1/v2/v3 split added. |
| Existing repo context captured | Partial | Design assumptions captured; actual repo still needs inspection. |
| Data storage defined | Pass | IndexedDB/Dexie schema and model constraints defined. |
| Legal/illegal states defined | Pass | FocusSession statuses and transitions clarified. |
| Active session rules defined | Pass | `running/paused/finishing` guard added. |
| User operations mapped to writes | Pass | Service behavior section added. |
| Reporting avoids double count | Pass | Subtree aggregation invariant and tests added. |
| Sync behavior defined | Pass for MVP | No sync; future requirements noted. |
| Migration/rollback covered | Partial | Version 1 and future migration rules added; real rollback depends on repo. |
| Test matrix maps to invariants | Pass | T001–T030 added. |
| Decision ledger updated | Pass | DEC/RISK/DEF entries added. |
| Ready for Codex implementation | Conditional | Ready after repo context validation and framework choices are confirmed. |

Final status: **Implementation-ready after repo inspection.**

