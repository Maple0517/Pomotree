import { describe, expect, it } from "vitest";
import type { FocusSession, TimerPause } from "@/types/domain";
import { computeElapsedSeconds, computeRemainingSeconds, formatClock } from "./timer";

const session: FocusSession = {
  id: "session-1",
  taskId: "task-1",
  originalTaskId: "task-1",
  taskPathSnapshot: "Task",
  originalTaskPathSnapshot: "Task",
  intention: null,
  summary: null,
  plannedSeconds: 25 * 60,
  actualSeconds: 0,
  status: "running",
  startedAt: "2026-05-25T00:00:00.000Z",
  endedAt: null,
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z",
};

describe("timer helpers", () => {
  it("formats a clock", () => {
    expect(formatClock(65)).toBe("01:05");
  });

  it("computes elapsed from wall-clock time", () => {
    expect(computeElapsedSeconds(session, [], new Date("2026-05-25T00:10:00.000Z").getTime())).toBe(600);
  });

  it("excludes paused time from elapsed", () => {
    const pauses: TimerPause[] = [
      {
        id: "pause-1",
        sessionId: "session-1",
        reason: null,
        startedAt: "2026-05-25T00:05:00.000Z",
        endedAt: "2026-05-25T00:08:00.000Z",
        createdAt: "2026-05-25T00:05:00.000Z",
        updatedAt: "2026-05-25T00:08:00.000Z",
      },
    ];

    expect(computeElapsedSeconds(session, pauses, new Date("2026-05-25T00:10:00.000Z").getTime())).toBe(420);
    expect(computeRemainingSeconds(session, pauses, new Date("2026-05-25T00:10:00.000Z").getTime())).toBe(1080);
  });
});
