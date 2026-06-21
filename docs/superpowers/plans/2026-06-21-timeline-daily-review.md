# Timeline Daily Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the Dashboard timeline into an always-visible Daily Review card with idle-time summary and pause context.

**Architecture:** Keep the existing `buildDailyTimelineModel` read model. Change only Dashboard placement, copy, and `DailyFocusTimeline` rendering; use existing `model.idleGaps` and `model.pauseSegments` instead of adding persistence or new services.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 utility classes, Playwright e2e, Vitest.

---

## File structure

- Modify `/Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts` for visible Review and pause-regression coverage.
- Modify `/Users/maple/Documents/Pomotree/src/app/page.tsx` for copy keys and to remove the collapsed `<details>` wrapper.
- Modify `/Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx` for Review framing, idle metric, and pause rail rendering.
- Do not modify `/Users/maple/Documents/Pomotree/src/lib/services/timeline.ts`; its existing `idleGaps` and `pauseSegments` already cover the feature.

---

### Task 1: Lock the always-visible Daily Review behavior

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Replace the collapsed-open setup in the timeline e2e test**

In `test("daily timeline uses proportional rail segments and selectable detail", ...)`, replace this block:

```ts
  await page.getByText("Daily focus timeline").first().click();
  const timeline = page.getByRole("region", { name: "Daily focus timeline" });
  await expect(timeline.getByRole("button", { name: "Full day" })).toBeVisible();
  await expect(timeline.getByText("Deep work").first()).toBeVisible();
  await expect(timeline.getByText("Quick note").first()).toBeVisible();
  await expect(timeline.locator("aside").getByText("Quick note")).toBeVisible();
  await expect(timeline.locator("aside").getByText(/10:00.*10:03/)).toBeVisible();
```

with this block:

```ts
  await expect(page.locator("details").filter({ hasText: "Daily focus timeline" })).toHaveCount(0);
  const timeline = page.getByRole("region", { name: "Today review" });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Full day" })).toBeVisible();
  await expect(timeline.getByText("Idle time")).toBeVisible();
  await expect(timeline.getByText("10m", { exact: true })).toBeVisible();
  await expect(timeline.getByText("Deep work").first()).toBeVisible();
  await expect(timeline.getByText("Quick note").first()).toBeVisible();
  await expect(timeline.locator("aside").getByText("Quick note")).toBeVisible();
  await expect(timeline.locator("aside").getByText(/10:00.*10:03/)).toBeVisible();
```

- [ ] **Step 2: Run the focused e2e test and verify it fails for the right reason**

Run:

```bash
npm run e2e -- tests/e2e/dashboard.spec.ts --grep "daily timeline uses proportional rail segments and selectable detail"
```

Expected: FAIL because the page still exposes `Daily focus timeline` inside a collapsed `<details>` wrapper and no `Today review` region exists yet.

---

### Task 2: Promote the timeline to an always-visible Review card

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/src/app/page.tsx`
- Modify: `/Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx`
- Test: `/Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Add the three copy keys in `page.tsx`**

In the `PageCopy` type, add these fields near `timeline`:

```ts
  todayReview: string;
  idleTime: string;
  emptyReviewHint: string;
```

In the English copy object, add:

```ts
    todayReview: "Today review",
    idleTime: "Idle time",
    emptyReviewHint: "Finish a focus session to build today's review.",
```

In the Chinese copy object, add:

```ts
    todayReview: "今天复盘",
    idleTime: "空档时长",
    emptyReviewHint: "完成一次专注后，这里会生成今天复盘。",
```

- [ ] **Step 2: Pass Review copy into `DailyFocusTimeline`**

In the `DailyFocusTimeline` `copy={{ ... }}` object in `page.tsx`, add:

```tsx
                      reviewLabel: copy.sectionReview,
                      todayReview: copy.todayReview,
                      idleTime: copy.idleTime,
                      emptyReviewHint: copy.emptyReviewHint,
```

- [ ] **Step 3: Remove the collapsed Dashboard wrapper**

In `page.tsx`, replace the current timeline wrapper:

```tsx
              <details className="group rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_0_var(--shadow-line)]">
                <summary className="flex list-none items-center justify-between gap-4 text-left [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.timeline}</p>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight">{copy.timeline}</h3>
                  </div>
                  <ChevronDown size={18} className="text-[var(--muted)] transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="mt-5">
                  <DailyFocusTimeline
                    copy={{
                      cancel: copy.cancel,
                      correctAttribution: copy.correctAttribution,
                      today: copy.today,
                      idle: copy.idle,
                      save: copy.save,
                      unassigned: copy.unassigned,
                      totalFocused: copy.totalFocused,
                      sessionCount: copy.sessionCount,
                      longestSession: copy.longestSession,
                      timeline: copy.timeline,
                      previousDay: copy.previousDay,
                      nextDay: copy.nextDay,
                      backToToday: copy.backToToday,
                      noSessionsForDay: copy.noSessionsForDay,
                      sessionDetail: copy.sessionDetail,
                      timeRange: copy.timeRange,
                      duration: copy.duration,
                      pauseDuration: copy.pauseDuration,
                      status: copy.status,
                      showFullDay: copy.showFullDay,
                      showActiveWindow: copy.showActiveWindow,
                      timingAnomaly: copy.timingAnomaly,
                      timingAnomalyCount: copy.timingAnomalyCount,
                      shortSessions: copy.shortSessions,
                      summary: copy.summary,
                    }}
                    language={language}
                    sessions={sessions}
                    pauses={pauses}
                    tasks={tasks}
                    taskOptions={taskOptions}
                    onChangeSessionAttribution={changeSessionAttribution}
                  />
                </div>
              </details>
```

with this always-visible component:

```tsx
              <DailyFocusTimeline
                copy={{
                  cancel: copy.cancel,
                  correctAttribution: copy.correctAttribution,
                  reviewLabel: copy.sectionReview,
                  today: copy.today,
                  todayReview: copy.todayReview,
                  idle: copy.idle,
                  idleTime: copy.idleTime,
                  emptyReviewHint: copy.emptyReviewHint,
                  save: copy.save,
                  unassigned: copy.unassigned,
                  totalFocused: copy.totalFocused,
                  sessionCount: copy.sessionCount,
                  longestSession: copy.longestSession,
                  timeline: copy.timeline,
                  previousDay: copy.previousDay,
                  nextDay: copy.nextDay,
                  backToToday: copy.backToToday,
                  noSessionsForDay: copy.noSessionsForDay,
                  sessionDetail: copy.sessionDetail,
                  timeRange: copy.timeRange,
                  duration: copy.duration,
                  pauseDuration: copy.pauseDuration,
                  status: copy.status,
                  showFullDay: copy.showFullDay,
                  showActiveWindow: copy.showActiveWindow,
                  timingAnomaly: copy.timingAnomaly,
                  timingAnomalyCount: copy.timingAnomalyCount,
                  shortSessions: copy.shortSessions,
                  summary: copy.summary,
                }}
                language={language}
                sessions={sessions}
                pauses={pauses}
                tasks={tasks}
                taskOptions={taskOptions}
                onChangeSessionAttribution={changeSessionAttribution}
              />
```

- [ ] **Step 4: Update the timeline copy type**

In `DailyFocusTimeline.tsx`, add these fields to `TimelineCopy`:

```ts
  reviewLabel: string;
  todayReview: string;
  idleTime: string;
  emptyReviewHint: string;
```

- [ ] **Step 5: Compute idle seconds**

In `DailyFocusTimeline`, after `const selectedSession = ...`, add:

```ts
  const idleSeconds = model.idleGaps.reduce((total, gap) => total + gap.durationSeconds, 0);
```

- [ ] **Step 6: Reframe the section header and nav label**

In `DailyFocusTimeline.tsx`, change the section and header start to:

```tsx
    <section aria-label={copy.todayReview} className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_var(--shadow-line)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.reviewLabel}</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{copy.todayReview}</h3>
        </div>
        <nav className="flex items-center gap-2" aria-label={copy.todayReview}>
```

- [ ] **Step 7: Add the idle metric**

Replace the metrics grid with:

```tsx
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <TimelineMetric label={copy.totalFocused} value={formatCompactDuration(model.totalFocusSeconds)} tone="accent" />
        <TimelineMetric label={copy.sessionCount} value={String(model.sessionCount)} />
        <TimelineMetric label={copy.longestSession} value={formatCompactDuration(model.longestSessionSeconds)} tone="warm" />
        <TimelineMetric label={copy.idleTime} value={formatCompactDuration(idleSeconds)} />
      </div>
```

- [ ] **Step 8: Make the empty state feel like a Review card**

In `DailyFocusTimeline.tsx`, replace the `model.sessions.length === 0` block with:

```tsx
              {model.sessions.length === 0 ? (
                <div className="absolute left-0 top-1/2 max-w-[34ch] -translate-y-1/2 rounded-[1.35rem] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-[0_1px_0_var(--shadow-line)]">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{copy.noSessionsForDay}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{copy.emptyReviewHint}</p>
                </div>
              ) : null}
```

- [ ] **Step 9: Run the focused e2e test and verify it passes**

Run:

```bash
npm run e2e -- tests/e2e/dashboard.spec.ts --grep "daily timeline uses proportional rail segments and selectable detail"
```

Expected: PASS.

- [ ] **Step 10: Commit the first working slice**

Run:

```bash
git add /Users/maple/Documents/Pomotree/src/app/page.tsx /Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx /Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts
git commit -m "feat: promote timeline to daily review"
```

Expected: commit succeeds.

---

### Task 3: Lock pause-context rendering with e2e

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Add a pause segment assertion**

In the same e2e test, after this line:

```ts
  const rail = timeline.getByLabel("Timeline rail");
```

add:

```ts
  const pauseVisual = rail.getByTestId("timeline-pause-segment-pause-session-25m-0").first();
  await expect(pauseVisual).toBeVisible();
  const pauseBox = await pauseVisual.boundingBox();
  expect(pauseBox?.height ?? 0).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the focused e2e test and verify it fails for the right reason**

Run:

```bash
npm run e2e -- tests/e2e/dashboard.spec.ts --grep "daily timeline uses proportional rail segments and selectable detail"
```

Expected: FAIL because `timeline-pause-segment-pause-session-25m-0` is not rendered yet.

---

### Task 4: Render pause segments on the timeline rail

**Files:**
- Modify: `/Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx`
- Test: `/Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Render decorative pause segments before focus-group buttons**

In `DailyFocusTimeline.tsx`, inside:

```tsx
            <div className="relative" aria-label="Timeline rail">
              <div className="absolute left-1/2 top-0 h-full w-[5px] -translate-x-1/2 rounded-full bg-[var(--border)]" />
```

add this block immediately after the rail background `<div />`:

```tsx
              {model.pauseSegments.map((pause) => {
                const top = projectTimeToPercent(pause.startAt.getTime(), viewStartMs, viewEndMs);
                const height = projectTimeToPercent(pause.endAt.getTime(), viewStartMs, viewEndMs) - top;
                const visualHeightPx = Math.max((height / 100) * timelineHeight, 10);
                return (
                  <span
                    key={pause.id}
                    data-testid={`timeline-pause-segment-${pause.id}`}
                    className="absolute left-1/2 w-3 -translate-x-1/2 rounded-full bg-[var(--muted)]/60 ring-[3px] ring-[var(--surface)]"
                    style={{ top: `${top}%`, height: visualHeightPx }}
                    aria-hidden="true"
                  />
                );
              })}
```

- [ ] **Step 2: Run the focused e2e test and verify it passes**

Run:

```bash
npm run e2e -- tests/e2e/dashboard.spec.ts --grep "daily timeline uses proportional rail segments and selectable detail"
```

Expected: PASS.

- [ ] **Step 3: Run lint and unit tests**

Run:

```bash
npm run lint
npm test
```

Expected: both commands PASS.

- [ ] **Step 4: Commit the pause slice**

Run:

```bash
git add /Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx /Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts
git commit -m "feat: show pause context in daily review"
```

Expected: commit succeeds.

---

### Task 5: Final verification

**Files:**
- Verify: `/Users/maple/Documents/Pomotree/src/app/page.tsx`
- Verify: `/Users/maple/Documents/Pomotree/src/components/DailyFocusTimeline.tsx`
- Verify: `/Users/maple/Documents/Pomotree/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Run the Dashboard e2e file**

Run:

```bash
npm run e2e -- tests/e2e/dashboard.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Check the final git state**

Run:

```bash
git status --short
git log --oneline -3
```

Expected: `git status --short` prints nothing; the two implementation commits are above the plan/spec commits.
