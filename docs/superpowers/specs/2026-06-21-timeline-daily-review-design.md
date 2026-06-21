# Timeline daily review design

Date: 2026-06-21
Scope: Dashboard daily timeline in `/Users/maple/Documents/Pomotree/src/app/page.tsx` and `/Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx`.

## Problem

The timeline already has useful data: daily navigation, focus totals, proportional blocks, grouped detail, attribution correction, active-hours/full-day mode, and anomaly warnings. It still feels like a utility panel because it is hidden inside a collapsed Dashboard `<details>` section and reads as a raw timeline instead of a daily review.

## Goal

Make the timeline a product-grade **Daily Review** feature: when the user opens the Dashboard, they can quickly understand how today went, where focus happened, where time leaked, and which block needs review.

## Non-goals

- No database/schema changes.
- No new dependencies.
- No separate Review page.
- No weekly/monthly analytics.
- No invented focus score or coaching suggestions.
- No batch editing of grouped sessions.
- No release or `/Applications` replacement in this design step.

## Recommended design

Use the approved **A2: Review core card** direction.

Replace the current collapsed timeline wrapper with an always-visible Review card in the Dashboard review area. The card keeps the existing timeline model and interactions, but changes presentation from “hidden report” to “today summary + readable timeline + selected detail”.

### Header

- Label: `Review` / `回顾`.
- Title: `Today review` / `今天复盘`.
- Date controls stay visible: previous day, current day label, next day, today.
- Keep active-hours/full-day toggle.
- Show anomaly count inline only when present.

### Summary metrics

Keep current metrics and add one lightweight metric from existing data:

- Total focused.
- Sessions.
- Longest.
- Idle time, computed from existing `model.idleGaps`.

If idle time is zero, show `0m`; do not hide the metric because stable layout is easier to scan.

### Timeline body

- Keep the proportional vertical rail.
- Keep grouped session selection: visible merged blocks select the merged unit.
- Add pause visibility using existing `model.pauseSegments` so a completed session with pauses does not look like uninterrupted focus.
- Keep idle gaps as inline timeline annotations, but make them visually quieter than focus blocks.
- Preserve active-hours default; full-day remains an explicit toggle.
- Keep selected focus block ring and hover/focus states.

### Detail panel

- Default selection remains the latest visible group for the day.
- Single-session selections can still correct attribution.
- Grouped selections show aggregated detail only; do not expose single-session attribution editing from the grouped detail.
- Show summary text when present.
- Show timing anomaly warning inside the selected detail when any selected session is anomalous.

### Empty state

When a day has no completed sessions:

- Show a composed empty card inside the Review section.
- Text should explain that no completed focus session exists for the day.
- Do not add a new action unless a nearby existing focus/start control can be linked without extra state plumbing.

### Accessibility and interaction

- The Review card remains a labelled region.
- Timeline rail buttons keep descriptive `aria-label`s with task title and time range.
- Pause segments are decorative unless they become selectable; for this version, they are visual context only.
- All interactive controls keep visible focus states.
- Avoid color-only meaning: selected block uses both ring/shadow and color.

## Component and data flow

No persistence changes.

`src/app/page.tsx`

- Remove the `<details>` wrapper around `DailyFocusTimeline`.
- Place `DailyFocusTimeline` directly in the Dashboard review area.
- Pass copy for the new labels and idle metric.

`src/components/DailyFocusTimeline.tsx`

- Rename visible copy from generic timeline framing toward Daily Review framing.
- Add the idle-time metric from `model.idleGaps`.
- Render pause segments on the rail using `model.pauseSegments`.
- Keep existing grouped annotation and selected-detail helpers.
- Keep attribution editing limited to single sessions.

`src/lib/services/timeline.ts`

- Prefer no change. Existing `pauseSegments`, `idleGaps`, `sessions`, and totals are enough.

## Testing

Use the narrow checks first:

1. Update or add a component/e2e assertion that the Daily Review region is visible without opening a `<details>` section.
2. Keep the existing grouped-detail regression: clicking the merged block shows aggregated duration.
3. Add/adjust a test assertion that pause context renders when seeded pauses exist.
4. Run:
   - `npm run e2e -- tests/e2e/dashboard.spec.ts`
   - `npm run lint`
   - `npm test`

Run `npm run build` if implementation touches layout structure beyond the Dashboard review section.
