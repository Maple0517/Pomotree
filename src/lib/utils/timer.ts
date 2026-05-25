import type { FocusSession, TimerPause } from "@/types/domain";

export function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function computeElapsedSeconds(session: FocusSession, pauses: TimerPause[], now = Date.now()) {
  const startedAt = new Date(session.startedAt).getTime();
  const pauseMs = pauses
    .filter((pause) => pause.sessionId === session.id)
    .reduce((total, pause) => {
      const start = new Date(pause.startedAt).getTime();
      const end = pause.endedAt ? new Date(pause.endedAt).getTime() : now;
      return total + Math.max(0, end - start);
    }, 0);

  return Math.max(0, Math.floor((now - startedAt - pauseMs) / 1000));
}

export function computeRemainingSeconds(session: FocusSession, pauses: TimerPause[], now = Date.now()) {
  return Math.max(0, session.plannedSeconds - computeElapsedSeconds(session, pauses, now));
}
