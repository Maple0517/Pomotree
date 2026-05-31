import { describe, expect, it } from "vitest";
import type { FocusSession, Task, TimerPause } from "@/types/domain";
import { buildCanonicalSessionTimeline, buildDailyTimelineModel, buildLocalDayRange, formatCompactDuration } from "./timeline";

function iso(date: Date) {
  return date.toISOString();
}

function at(day: number, hour: number, minute = 0) {
  return new Date(2026, 4, day, hour, minute, 0, 0);
}

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  const startedAt = overrides.startedAt ?? iso(at(25, 9));
  const endedAt = overrides.endedAt ?? iso(at(25, 9, 25));
  return {
    id: overrides.id ?? "session-1",
    taskId: overrides.taskId ?? "task-1",
    originalTaskId: overrides.originalTaskId ?? overrides.taskId ?? "task-1",
    taskPathSnapshot: overrides.taskPathSnapshot ?? null,
    originalTaskPathSnapshot: overrides.originalTaskPathSnapshot ?? null,
    intention: overrides.intention ?? null,
    summary: overrides.summary ?? null,
    plannedSeconds: overrides.plannedSeconds ?? 1500,
    actualSeconds: overrides.actualSeconds ?? 1500,
    status: overrides.status ?? "completed",
    startedAt,
    endedAt,
    createdAt: overrides.createdAt ?? startedAt,
    updatedAt: overrides.updatedAt ?? endedAt ?? startedAt,
  };
}

function makePause(overrides: Partial<TimerPause> = {}): TimerPause {
  const startedAt = overrides.startedAt ?? iso(at(25, 9, 10));
  return {
    id: overrides.id ?? "pause-1",
    sessionId: overrides.sessionId ?? "session-1",
    reason: overrides.reason ?? null,
    startedAt,
    endedAt: overrides.endedAt === undefined ? iso(at(25, 9, 20)) : overrides.endedAt,
    createdAt: overrides.createdAt ?? startedAt,
    updatedAt: overrides.updatedAt ?? startedAt,
  };
}

const tasks: Task[] = [
  { id: "task-1", parentId: null, title: "Codex", status: "todo", sortOrder: 0, createdAt: iso(at(25, 8)), updatedAt: iso(at(25, 8)) },
  { id: "task-2", parentId: null, title: "Review", status: "todo", sortOrder: 1, createdAt: iso(at(25, 8)), updatedAt: iso(at(25, 8)) },
];

function build(sessions: FocusSession[], pauses: TimerPause[] = [], day = at(25, 12), showFullDay?: boolean) {
  return buildDailyTimelineModel({ sessions, pauses, tasks, day, fallbackTitle: "Unassigned", showFullDay });
}

describe("timeline read model", () => {
  it("generates focus blocks proportional to duration", () => {
    const first = makeSession({ id: "first", startedAt: iso(at(25, 9)), endedAt: iso(at(25, 9, 25)), actualSeconds: 1500 });
    const second = makeSession({ id: "second", taskId: "task-2", startedAt: iso(at(25, 10)), endedAt: iso(at(25, 10, 3)), actualSeconds: 180 });

    const model = build([first, second]);

    expect(model.focusSegments.map((segment) => segment.durationSeconds)).toEqual([1500, 180]);
    expect(model.totalFocusSeconds).toBe(1680);
    expect(model.longestSessionSeconds).toBe(1500);
  });

  it("keeps blank dates at zero", () => {
    const model = build([]);

    expect(model.totalFocusSeconds).toBe(0);
    expect(model.longestSessionSeconds).toBe(0);
    expect(model.sessionCount).toBe(0);
    expect(formatCompactDuration(model.totalFocusSeconds)).toBe("0m");
  });

  it("splits pauses into separate segments", () => {
    const session = makeSession({ id: "session-1", startedAt: iso(at(25, 9)), endedAt: iso(at(25, 9, 30)), actualSeconds: 1200 });
    const pause = makePause({ sessionId: session.id, startedAt: iso(at(25, 9, 10)), endedAt: iso(at(25, 9, 20)) });

    const model = build([session], [pause]);

    expect(model.focusSegments.map((segment) => [segment.startAt.getMinutes(), segment.endAt.getMinutes()])).toEqual([[0, 10], [20, 30]]);
    expect(model.pauseSegments.map((segment) => [segment.startAt.getMinutes(), segment.endAt.getMinutes()])).toEqual([[10, 20]]);
    expect(model.totalFocusSeconds).toBe(1200);
  });

  it("counts long finishing dwell time as focus when saved that way", () => {
    const session = makeSession({ startedAt: iso(at(25, 9)), endedAt: iso(at(25, 11)), actualSeconds: 7200 });

    const model = build([session]);

    expect(model.focusSegments).toHaveLength(1);
    expect(model.focusSegments[0].startAt.getHours()).toBe(9);
    expect(model.focusSegments[0].endAt.getHours()).toBe(11);
    expect(model.totalFocusSeconds).toBe(7200);
    expect(model.sessions[0].hasTimingAnomaly).toBe(false);
  });

  it("clamps impossible saved duration", () => {
    const session = makeSession({ startedAt: iso(at(25, 9)), endedAt: iso(at(25, 10)), actualSeconds: 33240 });

    const model = build([session]);

    expect(model.totalFocusSeconds).toBe(3600);
    expect(model.sessions[0].hasTimingAnomaly).toBe(true);
    expect(model.anomalyCount).toBe(1);
  });

  it("clips cross-midnight sessions after consuming actualSeconds once", () => {
    const session = makeSession({ startedAt: iso(at(25, 23, 50)), endedAt: iso(at(26, 0, 20)), actualSeconds: 1800 });

    expect(build([session], [], at(25, 12)).totalFocusSeconds).toBe(600);
    expect(build([session], [], at(26, 12)).totalFocusSeconds).toBe(1200);
  });

  it("does not duplicate actualSeconds on cross-midnight import records", () => {
    const session = makeSession({ startedAt: iso(at(25, 23, 50)), endedAt: iso(at(26, 1)), actualSeconds: 1500 });
    const canonical = buildCanonicalSessionTimeline({ session, pauses: [] });

    expect(canonical?.focusIntervals.map((interval) => [new Date(interval.startMs).getHours(), new Date(interval.endMs).getHours(), new Date(interval.endMs).getMinutes()])).toEqual([[23, 0, 15]]);
    expect(build([session], [], at(25, 12)).totalFocusSeconds).toBe(600);
    expect(build([session], [], at(26, 12)).totalFocusSeconds).toBe(900);
  });

  it("uses local calendar day duration instead of hard-coded 24 hours", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(buildLocalDayRange(new Date(2026, 2, 8)).dayDurationMs).toBe(23 * 60 * 60 * 1000);
      expect(buildLocalDayRange(new Date(2026, 10, 1)).dayDurationMs).toBe(25 * 60 * 60 * 1000);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("defaults to an active window with at least six hours", () => {
    const session = makeSession({ startedAt: iso(at(25, 9, 13)), endedAt: iso(at(25, 13, 51)), actualSeconds: 4 * 3600 });

    const model = build([session]);

    expect(model.viewStart.getHours()).toBe(8);
    expect(model.viewStart.getMinutes()).toBe(0);
    expect(model.viewEnd.getHours()).toBe(15);
    expect(model.viewEnd.getMinutes()).toBe(0);
    expect(model.viewEnd.getTime() - model.viewStart.getTime()).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
  });

  it("supports full-day mode", () => {
    const session = makeSession();
    const model = build([session], [], at(25, 12), true);

    expect(model.viewStart.getTime()).toBe(model.dayStart.getTime());
    expect(model.viewEnd.getTime()).toBe(model.dayEnd.getTime());
  });

  it("keeps task color stable when task order changes", () => {
    const session = makeSession({ taskId: "task-2" });
    const first = buildDailyTimelineModel({ sessions: [session], pauses: [], tasks, day: at(25, 12), fallbackTitle: "Unassigned" });
    const second = buildDailyTimelineModel({ sessions: [session], pauses: [], tasks: tasks.slice().reverse(), day: at(25, 12), fallbackTitle: "Unassigned" });

    expect(first.sessions[0].color).toBe(second.sessions[0].color);
  });

  it("merges overlapping pauses before subtracting focus", () => {
    const session = makeSession({ startedAt: iso(at(25, 9)), endedAt: iso(at(25, 10)), actualSeconds: 2400 });
    const pauses = [
      makePause({ id: "pause-a", startedAt: iso(at(25, 9, 10)), endedAt: iso(at(25, 9, 30)) }),
      makePause({ id: "pause-b", startedAt: iso(at(25, 9, 20)), endedAt: iso(at(25, 9, 40)) }),
    ];

    const model = build([session], pauses);

    expect(model.pauseSegments.map((segment) => [segment.startAt.getMinutes(), segment.endAt.getMinutes()])).toEqual([[10, 40]]);
    expect(model.focusSegments.map((segment) => [segment.startAt.getMinutes(), segment.endAt.getMinutes()])).toEqual([[0, 10], [40, 0]]);
    expect(model.totalFocusSeconds).toBe(1800);
    expect(model.sessions[0].hasTimingAnomaly).toBe(true);
  });

  it("clips terminal open pauses to session end", () => {
    const session = makeSession({ startedAt: iso(at(25, 9)), endedAt: iso(at(25, 10)), actualSeconds: 2700 });
    const pause = makePause({ startedAt: iso(at(25, 9, 15)), endedAt: null });

    const model = build([session], [pause]);

    expect(model.pauseSegments.map((segment) => [segment.startAt.getMinutes(), segment.endAt.getHours(), segment.endAt.getMinutes()])).toEqual([[15, 10, 0]]);
    expect(model.focusSegments.map((segment) => [segment.startAt.getMinutes(), segment.endAt.getMinutes()])).toEqual([[0, 15]]);
    expect(model.totalFocusSeconds).toBe(900);
    expect(model.sessions[0].hasTimingAnomaly).toBe(true);
  });
});
