import { endOfDay, isWithinInterval, startOfDay } from "date-fns";
import type { FocusSession, Interruption, Task, TimerPause } from "@/types/domain";
import { sumCanonicalFocusSecondsForRange } from "./timeline";

export interface TodayStats {
  completedCount: number;
  partialCount: number;
  totalFocusSeconds: number;
  openInterruptionCount: number;
}

export interface TaskStats {
  completedCount: number;
  totalFocusSeconds: number;
}

export function getLocalDayRange(now = new Date()) {
  return {
    startInclusive: startOfDay(now),
    endExclusive: new Date(endOfDay(now).getTime() + 1),
  };
}

function isInLocalDay(iso: string, now = new Date()) {
  const day = getLocalDayRange(now);
  return isWithinInterval(new Date(iso), {
    start: day.startInclusive,
    end: new Date(day.endExclusive.getTime() - 1),
  });
}

export function getSubtreeTaskIds(tasks: Task[], taskId: string) {
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentId) {
      childrenByParent.set(task.parentId, [...(childrenByParent.get(task.parentId) ?? []), task]);
    }
  }

  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const child of childrenByParent.get(id) ?? []) visit(child.id);
  };

  visit(taskId);
  return ids;
}

export function getTodayStats(sessions: FocusSession[], pauses: TimerPause[], interruptions: Interruption[], now = new Date()): TodayStats {
  const todaySessions = sessions.filter((session) => isInLocalDay(session.startedAt, now));
  const day = getLocalDayRange(now);

  return {
    completedCount: todaySessions.filter((session) => session.status === "completed").length,
    partialCount: todaySessions.filter((session) => session.status === "partial").length,
    totalFocusSeconds: sumCanonicalFocusSecondsForRange({
      sessions,
      pauses,
      start: day.startInclusive,
      end: day.endExclusive,
    }),
    openInterruptionCount: interruptions.filter((interruption) => interruption.status === "open" && isInLocalDay(interruption.createdAt, now)).length,
  };
}

export function getTaskStats(tasks: Task[], sessions: FocusSession[], taskId: string): TaskStats {
  const subtreeIds = getSubtreeTaskIds(tasks, taskId);
  const attributed = sessions.filter((session) => session.taskId !== null && subtreeIds.has(session.taskId));
  return {
    completedCount: attributed.filter((session) => session.status === "completed").length,
    totalFocusSeconds: attributed
      .filter((session) => session.status === "completed" || session.status === "partial")
      .reduce((total, session) => total + session.actualSeconds, 0),
  };
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
