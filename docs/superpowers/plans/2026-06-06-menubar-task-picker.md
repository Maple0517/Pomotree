# Menubar Task Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the menubar's flat `Parent / Child` task display with a mature tree picker where parent tasks remain selectable and child rows do not repeat parent titles.

**Architecture:** Keep this menubar-local. Add display helpers and a small tree row component inside `/Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx`, reusing `getTaskPathIds` and existing task data. Tests should lock the UX through `/Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts` before implementation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind utility classes, Playwright E2E, Zustand/Dexie app store.

---

## Scope check

This plan covers one subsystem: `/menubar` task display and selection. It does not change the task model, Dashboard task tree, Tauri shell size, release packaging, or local `/Applications` replacement.

## Files

- Modify: `/Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx`
  - Add task display metadata helpers.
  - Replace flat idle task picker rows with a tree picker.
  - Update running/paused context block to show task title plus parent context outside the tree.
  - Keep finish attribution as native `<select>` unless a test shows it is part of the same user-visible problem; native select cannot render the mature two-line tree without a larger component change.
- Modify: `/Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts`
  - Add focused E2E coverage for parent selection, child selection, tree expansion, no repeated parent in child rows, and selected trigger context.

## Existing constraints to preserve

- `Start unassigned` stays the first picker row.
- Active tasks exclude `done` and `archived`.
- Last completed active task defaulting remains unchanged.
- The menubar shell remains `380px` by `450px`.
- Child rows inside the open tree show only their own title.
- Selected task outside the tree may show parent context as small secondary text.

---

### Task 1: Add failing E2E coverage for hierarchical task picker

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts`

- [ ] **Step 1: Add the failing test**

Append this test to `/Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts`:

```ts
test("menubar task picker treats parent and child tasks as selectable tree rows", async ({ page }) => {
  await page.goto("/menubar", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByPlaceholder("Task or path, e.g. Project / Subtask").fill("Write report / Research sources");
  await page.getByRole("button", { name: "Add task" }).last().click();

  const taskPicker = page.getByRole("button", { name: /Research sources/ }).first();
  await expect(taskPicker).toBeVisible();
  await expect(taskPicker).toContainText("Research sources");
  await expect(taskPicker).toContainText("Write report");

  await taskPicker.click();

  const expandedParent = page.getByRole("button", { name: "Collapse Write report" });
  await expect(expandedParent).toBeVisible();

  const parentRow = page.getByRole("button", { name: /^Write report 1 subtask$/ });
  await expect(parentRow).toBeVisible();

  const childRow = page.getByRole("button", { name: /^Research sources selected$/ });
  await expect(childRow).toBeVisible();
  await expect(childRow).toContainText("Research sources");
  await expect(childRow).not.toContainText("Write report");

  await parentRow.click();
  await expect(page.getByRole("button", { name: /^Write report 1 subtask$/ })).toBeVisible();

  await expandedParent.click();
  await expect(page.getByRole("button", { name: "Expand Write report" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Research sources/ })).toBeHidden();
});
```

If the current placeholder text differs because the app language is Chinese, use the English test environment already implied by existing E2E expectations. Do not add a language switch for this test unless the test fails specifically because language defaults changed.

- [ ] **Step 2: Run the focused E2E and verify it fails for the current flat picker**

Run:

```bash
npm run e2e -- tests/e2e/menubar.spec.ts
```

Expected before implementation: the new test fails because the picker does not expose `Collapse Write report`, does not render tree rows, or child rows include `Write report / Research sources` as a flat path.

- [ ] **Step 3: Commit only the failing test if following strict TDD**

```bash
git add /Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts
git commit -m "test: cover menubar hierarchical task picker"
```

If the implementation is done in one small commit instead, skip this commit and commit test plus code together after Task 3.

---

### Task 2: Add menubar-local task display helpers

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx`

- [ ] **Step 1: Add helper types below `MenubarView`**

Add:

```ts
type TaskDisplayMeta = {
  title: string;
  parentContext: string | null;
  childCount: number;
};
```

- [ ] **Step 2: Replace the current `taskPath` helper with display helpers**

Replace the existing `taskPath` function with this block:

```ts
function taskPathTitles(tasks: Task[], taskId: string | null | undefined) {
  if (!taskId) return [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return getTaskPathIds(tasks, taskId)
    .map((id) => byId.get(id)?.title)
    .filter((title): title is string => Boolean(title));
}

function taskPath(tasks: Task[], taskId: string | null | undefined) {
  const titles = taskPathTitles(tasks, taskId);
  return titles.length ? titles.join(" / ") : null;
}

function taskDisplayMeta(tasks: Task[], taskId: string | null | undefined): TaskDisplayMeta | null {
  if (!taskId) return null;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const task = byId.get(taskId);
  if (!task) return null;

  const titles = taskPathTitles(tasks, taskId);
  const parentTitles = titles.slice(0, -1);
  const childCount = tasks.filter((item) => item.parentId === taskId && item.status !== "archived" && item.status !== "done").length;

  return {
    title: task.title,
    parentContext: parentTitles.length ? parentTitles.join(" / ") : null,
    childCount,
  };
}

function childCountLabel(count: number, language: AppLanguage) {
  if (count <= 0) return null;
  return language === "zh" ? `${count} 个子任务` : `${count} ${count === 1 ? "subtask" : "subtasks"}`;
}
```

`taskPath` stays for service snapshots and native select fallback. New UI should prefer `taskDisplayMeta`.

- [ ] **Step 3: Run TypeScript-aware lint to catch helper mistakes**

Run:

```bash
npm run lint
```

Expected: existing lint should pass. If it fails because helpers are unused, continue to Task 3 before committing.

---

### Task 3: Replace idle flat picker with quiet tree picker

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx`

- [ ] **Step 1: Import `MouseEvent` and tree helpers**

Change the React import from:

```ts
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
```

to:

```ts
import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
```

Change the task selector import from:

```ts
import { getTaskPathIds } from "@/lib/services/taskSelectors";
```

to:

```ts
import { getActiveTaskRows, getAutoExpandedTaskIds, getTaskPathIds } from "@/lib/services/taskSelectors";
```

- [ ] **Step 2: Add `TaskPickerRow` before `IdleStartForm`**

Add this component after `SettingsButton`:

```tsx
function TaskPickerRow({
  copy,
  language,
  task,
  depth,
  hasChildren,
  expanded,
  selected,
  tasks,
  onSelect,
  onToggleExpanded,
}: {
  copy: MenubarCopy;
  language: AppLanguage;
  task: Task;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  tasks: Task[];
  onSelect: (taskId: string) => void;
  onToggleExpanded: (taskId: string) => void;
}) {
  const meta = taskDisplayMeta(tasks, task.id);
  const countLabel = childCountLabel(meta?.childCount ?? 0, language);
  const rowLabel = [task.title, countLabel, selected ? "selected" : null].filter(Boolean).join(" ");
  const chevronLabel = `${expanded ? "Collapse" : "Expand"} ${task.title}`;
  const indentation = Math.min(depth * 22, 66);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleExpanded(task.id);
  };

  return (
    <div className="relative" style={{ paddingLeft: indentation }}>
      <button
        type="button"
        onClick={() => onSelect(task.id)}
        aria-label={rowLabel}
        className={`menubar-button flex min-h-[42px] w-full items-center justify-between gap-2 rounded-[12px] px-2.5 py-2 text-left transition ${selected ? "bg-[var(--menubar-selected-bg)] text-[var(--menubar-selected-text)] shadow-[0_8px_18px_rgba(194,65,12,0.22)]" : "text-[var(--menubar-text)] hover:bg-[var(--menubar-control-bg)]"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              aria-label={chevronLabel}
              aria-expanded={expanded}
              onClick={toggle}
              className={`menubar-button grid h-6 w-6 shrink-0 place-items-center rounded-[8px] ${selected ? "bg-white/15 text-current" : "bg-[var(--menubar-control-bg)] text-[var(--menubar-muted-strong)]"}`}
            >
              <ChevronDown className={expanded ? "transition-transform" : "-rotate-90 transition-transform"} size={14} strokeWidth={2.5} />
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-extrabold leading-[1.15]">{task.title}</span>
            {countLabel ? <span className={`mt-0.5 block truncate text-[11px] font-bold ${selected ? "text-current/75" : "text-[var(--menubar-muted)]"}`}>{countLabel}</span> : null}
          </span>
        </span>
        {selected ? <Check size={16} strokeWidth={2.4} className="shrink-0" /> : null}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update `IdleStartForm` props to receive `language`**

Change the function signature props from:

```tsx
function IdleStartForm({
  copy,
  tasks,
  labels,
```

to:

```tsx
function IdleStartForm({
  copy,
  language,
  tasks,
  labels,
```

Change the props type block from:

```ts
  copy: MenubarCopy;
  tasks: Task[];
```

to:

```ts
  copy: MenubarCopy;
  language: AppLanguage;
  tasks: Task[];
```

At the call site in `MenubarApp`, pass:

```tsx
language={language}
```

immediately after `copy={copy}`.

- [ ] **Step 4: Add expansion state and tree rows inside `IdleStartForm`**

Inside `IdleStartForm`, after `showTaskCreator` state, add:

```ts
const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
```

After `activeTasks`, add:

```ts
const autoExpandedTaskIds = useMemo(() => getAutoExpandedTaskIds(activeTasks, [effectiveTaskId]), [activeTasks, effectiveTaskId]);
const visibleExpandedTaskIds = useMemo(() => new Set([...autoExpandedTaskIds, ...expandedTaskIds]), [autoExpandedTaskIds, expandedTaskIds]);
const activeTaskRows = useMemo(
  () => getActiveTaskRows(activeTasks).filter((row) => row.depth === 0 || visibleExpandedTaskIds.has(row.task.parentId ?? "")),
  [activeTasks, visibleExpandedTaskIds],
);
const selectedTaskMeta = effectiveTaskId ? taskDisplayMeta(tasks, effectiveTaskId) : null;
const selectedChildCountLabel = selectedTaskMeta ? childCountLabel(selectedTaskMeta.childCount, language) : null;
```

Add this toggle helper near `updateSelectedTaskId`:

```ts
const toggleExpandedTask = (taskId: string) => {
  setExpandedTaskIds((current) => {
    const next = new Set(current);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    return next;
  });
};
```

- [ ] **Step 5: Replace trigger label with task-first two-line display**

Replace:

```tsx
<span className="line-clamp-2 min-w-0">{selectedTaskPath ?? copy.startUnassigned}</span>
```

with:

```tsx
<span className="min-w-0">
  <span className="block truncate">{selectedTaskMeta?.title ?? copy.startUnassigned}</span>
  {selectedTaskMeta?.parentContext || selectedChildCountLabel ? (
    <span className="mt-0.5 block truncate text-[11px] font-bold opacity-75">
      {selectedTaskMeta.parentContext ?? selectedChildCountLabel}
    </span>
  ) : null}
</span>
```

Remove the now-unused `selectedTaskPath` constant if lint reports it unused.

- [ ] **Step 6: Replace flat `activeTasks.map` list with tree rows**

Replace the current `activeTasks.map((task) => { ... })` block inside the picker dropdown with:

```tsx
{activeTaskRows.map(({ task, depth, hasChildren }) => {
  const selected = effectiveTaskId === task.id;
  const expanded = visibleExpandedTaskIds.has(task.id);
  return (
    <TaskPickerRow
      key={task.id}
      copy={copy}
      language={language}
      task={task}
      depth={depth}
      hasChildren={hasChildren}
      expanded={expanded}
      selected={selected}
      tasks={tasks}
      onSelect={updateSelectedTaskId}
      onToggleExpanded={toggleExpandedTask}
    />
  );
})}
```

- [ ] **Step 7: Run the new E2E test and verify the picker behavior passes**

Run:

```bash
npm run e2e -- tests/e2e/menubar.spec.ts
```

Expected: the new hierarchical picker test passes. If role names differ by whitespace, update the test assertions to match the accessible names produced by `aria-label` exactly.

---

### Task 4: Update running and paused context to show task-first display

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx`

- [ ] **Step 1: Replace `ContextBlock` title logic**

Replace `ContextBlock` with:

```tsx
function ContextBlock({ copy, session, tasks }: { copy: MenubarCopy; session: FocusSession; tasks: Task[] }) {
  const meta = taskDisplayMeta(tasks, session.taskId);
  const snapshotTitle = session.taskPathSnapshot?.split(" / ").filter(Boolean).at(-1) ?? null;
  const title = session.intention?.trim() || meta?.title || snapshotTitle || copy.noGoal;
  const context = meta?.parentContext ?? (session.intention?.trim() ? (session.taskPathSnapshot ?? null) : null);

  return (
    <section>
      <h2 className="line-clamp-2 text-[22px] font-bold leading-[1.18] tracking-[-0.02em] text-[var(--menubar-text)]">{title}</h2>
      {context ? <p className="mt-1 truncate text-[13px] font-bold text-[var(--menubar-muted)]">{context}</p> : null}
    </section>
  );
}
```

This keeps intention-first behavior. If a user typed an intention, it remains the main title; task context can still appear below.

- [ ] **Step 2: Extend the E2E test to verify running title behavior**

In the new test from Task 1, after selecting `Research sources`, add:

```ts
await page.getByRole("button", { name: "Start Focus" }).click();
await expect(page.getByRole("heading", { name: "Research sources" })).toBeVisible();
await expect(page.getByText("Write report")).toBeVisible();
```

If `Write report` appears in multiple places while the dropdown remains open, close the dropdown before starting focus or assert inside the running stage after the Start Focus click.

- [ ] **Step 3: Run E2E again**

Run:

```bash
npm run e2e -- tests/e2e/menubar.spec.ts
```

Expected: all menubar E2E tests pass.

---

### Task 5: Final verification and commit

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx`
- Modify: `/Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts`

- [ ] **Step 1: Re-read changed code**

Run:

```bash
git diff -- /Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx /Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts
```

Check specifically:

- No child row renders parent context inside the picker tree.
- Parent row remains selectable.
- Chevron `onClick` stops propagation.
- No changes to Tauri shell dimensions.

- [ ] **Step 2: Run narrow verification**

Run:

```bash
npm run e2e -- tests/e2e/menubar.spec.ts
npm run lint
npm test
```

Expected: all pass.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: only these implementation files are modified:

```text
 M src/app/menubar/MenubarApp.tsx
 M tests/e2e/menubar.spec.ts
```

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add /Users/maple/Documents/Pomotree/src/app/menubar/MenubarApp.tsx /Users/maple/Documents/Pomotree/tests/e2e/menubar.spec.ts
git commit -m "feat: refine menubar task picker hierarchy"
```

- [ ] **Step 5: Report skipped release work explicitly**

State that release, push, and local `/Applications/Pomotree.app` replacement were not run because this task only requested the UI change and did not ask for packaging/replacement.

---

## Plan self-review

- Spec coverage: covered parent task selectability, child task selectability, separate chevron expansion, no repeated parent title in child rows, selected trigger context, running/paused task-first display, and validation commands.
- Placeholder scan: no placeholder markers are intentionally present in this plan.
- Type consistency: helper names are consistent across tasks: `TaskDisplayMeta`, `taskPathTitles`, `taskDisplayMeta`, `childCountLabel`, and `TaskPickerRow`.
- Scope control: release, push, and local app replacement are explicitly out of scope unless requested after implementation.
- Parent tasks remain selectable: row body click selects the parent task; only the chevron toggles expansion.
- Do not repeat the parent title in child rows: this is enforced by `TaskPickerRow` rendering `task.title` only inside the open picker tree.
