import { describe, expect, it } from "vitest";
import type { FocusSession, Interruption, Task, TimerPause } from "@/types/domain";
import { formatDuration, getSubtreeTaskIds, getTaskStats, getTodayStats } from "./stats";

const tasks: Task[] = [
  { id: "parent", parentId: null, title: "Parent", status: "todo", sortOrder: 0, createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z" },
  { id: "child", parentId: "parent", title: "Child", status: "todo", sortOrder: 0, createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z" },
];

function makeSession(id: string, status: FocusSession["status"], taskId: string | null, actualSeconds: number): FocusSession {
  return {
    id,
    taskId,
    originalTaskId: taskId,
    taskPathSnapshot: null,
    originalTaskPathSnapshot: null,
    intention: null,
    summary: null,
    plannedSeconds: 1500,
    actualSeconds,
    status,
    startedAt: "2026-05-25T10:00:00.000Z",
    endedAt: "2026-05-25T10:25:00.000Z",
    createdAt: "2026-05-25T10:00:00.000Z",
    updatedAt: "2026-05-25T10:25:00.000Z",
  };
}

const noPauses: TimerPause[] = [];

describe("stats selectors", () => {
  it("counts completed and partial today but not discarded", () => {
    const sessions = [
      makeSession("completed", "completed", "parent", 1500),
      makeSession("partial", "partial", "child", 600),
      makeSession("discarded", "discarded", "child", 300),
    ];
    const interruptions: Interruption[] = [
      { id: "i1", sessionId: null, taskId: null, text: "note", status: "open", createdAt: "2026-05-25T11:00:00.000Z", updatedAt: "2026-05-25T11:00:00.000Z" },
    ];

    expect(getTodayStats(sessions, noPauses, interruptions, new Date("2026-05-25T12:00:00.000Z"))).toEqual({
      completedCount: 1,
      partialCount: 1,
      totalFocusSeconds: 2100,
      openInterruptionCount: 1,
    });
  });

  it("uses one local-day boundary for sessions and interruptions", () => {
    const previousLocalDay = new Date(2026, 4, 24, 23, 59, 59).toISOString();
    const todayStart = new Date(2026, 4, 25, 0, 0, 0).toISOString();
    const todayNoon = new Date(2026, 4, 25, 12, 0, 0).toISOString();
    const nextLocalDay = new Date(2026, 4, 26, 0, 0, 0).toISOString();
    const sessions = [
      { ...makeSession("previous-day", "completed", "parent", 1500), startedAt: previousLocalDay, endedAt: todayStart },
      { ...makeSession("today", "completed", "parent", 600), startedAt: todayStart, endedAt: new Date(2026, 4, 25, 0, 10, 0).toISOString() },
      { ...makeSession("next-day", "partial", "parent", 300), startedAt: nextLocalDay, endedAt: new Date(2026, 4, 26, 0, 5, 0).toISOString() },
    ];
    const interruptions: Interruption[] = [
      { id: "open-today", sessionId: null, taskId: null, text: "today", status: "open", createdAt: todayNoon, updatedAt: todayNoon },
      { id: "open-next", sessionId: null, taskId: null, text: "next", status: "open", createdAt: nextLocalDay, updatedAt: nextLocalDay },
    ];

    expect(getTodayStats(sessions, noPauses, interruptions, new Date(2026, 4, 25, 12, 0, 0))).toEqual({
      completedCount: 1,
      partialCount: 0,
      totalFocusSeconds: 600,
      openInterruptionCount: 1,
    });
  });



  it("uses canonical clipped focus seconds for total focus time", () => {
    const crossMidnight = {
      ...makeSession("cross-midnight", "completed", "parent", 1500),
      startedAt: new Date(2026, 4, 24, 23, 50).toISOString(),
      endedAt: new Date(2026, 4, 25, 1, 0).toISOString(),
    };

    expect(getTodayStats([crossMidnight], noPauses, [], new Date(2026, 4, 25, 12, 0, 0)).totalFocusSeconds).toBe(900);
  });

  it("aggregates task stats by subtree", () => {
    const stats = getTaskStats(tasks, [makeSession("child-session", "completed", "child", 1500)], "parent");
    expect(stats).toEqual({ completedCount: 1, totalFocusSeconds: 1500 });
    expect([...getSubtreeTaskIds(tasks, "parent")]).toEqual(["parent", "child"]);
  });

  it("formats durations", () => {
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(3900)).toBe("1 h 5 min");
  });
});
