# Menubar task picker display design

Date: 2026-06-06
Scope: `/menubar` task picker and task title display only.

## Problem

Pomotree currently displays nested tasks as a flat path such as `主任务 / 子任务`. In the compact menubar, this feels like a filesystem path instead of a focused task. It also creates ambiguity when the user wants to pick a parent task versus a child task.

## Goals

- Make the current focus target read as the task being worked on, not as a path.
- Keep parent tasks selectable.
- Keep hierarchy readable when choosing a task.
- Avoid repeating the parent title inside already-expanded child rows.
- Keep the menubar lightweight and within the existing 380px by 450px shell.

## Non-goals

- No task data model changes.
- No Dashboard task-tree redesign.
- No release or `/Applications` replacement in this design step.
- No new task statuses or filtering semantics.

## Recommended design

Use a tree-style picker with split actions:

- Row body click selects that task.
- Left chevron click expands or collapses children.
- Parent rows remain selectable tasks.
- Child rows are indented under their parent.
- The selected row uses the existing warm selected accent.
- Rows with children can show a small child count such as `2 个子任务` / `2 subtasks`.

## Display rules

### Inside the open picker tree

- Parent row shows the parent task title.
- Child row shows only the child task title.
- Do not repeat the parent title in child rows, because hierarchy is already shown by expansion and indentation.
- For deeper nesting, indentation continues by level; each row still shows only its own task title.

### Outside the tree

When the selected task is displayed outside the open tree, show task-first context:

- Main title: selected task title.
- Secondary context: parent path, if any.

Examples:

- Selected parent: `写报告`; secondary text may show `2 个子任务` in the picker trigger.
- Selected child: `查资料`; secondary text shows `写报告`.
- Running / paused / finishing context block: title is the selected task title; parent path is smaller context text.

### Unassigned

- `Start unassigned` remains a normal first row in the picker.
- It has no chevron and no parent context.
- Selecting it clears the task selection.

## Component boundaries

Implement a small display helper in `src/app/menubar/MenubarApp.tsx` or a nearby menubar-local helper:

- Resolve a task path into `{ title, parentContext, childCount }`.
- Keep existing `getTaskPathIds` as the hierarchy source.
- Avoid changing persistence or service-layer task path snapshots.

Add a menubar-local task picker row component so selection, expansion, indentation, and row labels are not duplicated inline.

## Interaction details

- Chevron button has its own click handler and stops propagation so it does not select the row.
- Row button remains keyboard-focusable and selects the task.
- Chevron exposes `aria-expanded`.
- Selected row shows a checkmark on the right.
- Default expansion should include ancestors of the current/default selected task so the current item is visible.
- Existing automatic default task behavior stays unchanged: last completed active task can be default; done and archived tasks stay excluded.

## Styling direction

Adopt the confirmed "Quiet Tree" style:

- Light card container.
- Rounded rows.
- Subtle chevron pill for expandable rows.
- Warm selected background using existing menubar CSS variables.
- Child indentation instead of repeated parent text.
- Keep row density suitable for the 450px menubar height.

## Testing

Add or update `tests/e2e/menubar.spec.ts` to cover:

- Parent task can be selected.
- Child task can be selected.
- Expanding a parent reveals children.
- Child rows do not render the parent title as repeated row context.
- Selected child trigger displays child title with parent context outside the tree.

Run the narrow validation path after implementation:

1. `npm run e2e -- tests/e2e/menubar.spec.ts`
2. `npm run lint`
3. `npm test`

Broader build / Tauri verification is only needed if the final implementation changes shell sizing or if the user asks for local replacement / release.
