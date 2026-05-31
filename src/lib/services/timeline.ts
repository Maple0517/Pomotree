import type { FocusSession, Task, TimerPause } from "@/types/domain";

export type TimelineSegmentKind = "focus" | "pause";

type TimeInterval = {
  startMs: number;
  endMs: number;
};

export type TimelineSegment = {
  id: string;
  sessionId: string;
  kind: TimelineSegmentKind;
  taskId: string | null;
  title: string;
  color: string;
  startAt: Date;
  endAt: Date;
  startMs: number;
  endMs: number;
  durationSeconds: number;
};

export type TimelineGap = {
  id: string;
  startAt: Date;
  endAt: Date;
  startMs: number;
  endMs: number;
  durationSeconds: number;
};

export type TimelineSessionSummary = {
  sessionId: string;
  taskId: string | null;
  title: string;
  color: string;
  startAt: Date;
  endAt: Date;
  focusSeconds: number;
  pauseSeconds: number;
  status: "completed" | "partial";
  summary: string | null;
  hasTimingAnomaly: boolean;
};

export type DailyTimelineModel = {
  dayStart: Date;
  dayEnd: Date;
  viewStart: Date;
  viewEnd: Date;
  focusSegments: TimelineSegment[];
  pauseSegments: TimelineSegment[];
  idleGaps: TimelineGap[];
  sessions: TimelineSessionSummary[];
  totalFocusSeconds: number;
  longestSessionSeconds: number;
  sessionCount: number;
  anomalyCount: number;
};

export type CanonicalSessionTimeline = {
  sessionId: string;
  sessionStartMs: number;
  sessionEndMs: number;
  focusIntervals: TimeInterval[];
  pauseIntervals: TimeInterval[];
  availableFocusSeconds: number;
  consumedFocusSeconds: number;
  hasTimingAnomaly: boolean;
};

const TASK_PALETTE = ["#16a34a", "#2563eb", "#7c3aed", "#ea580c", "#db2777", "#0891b2"];
const UNASSIGNED_COLOR = "#8b5cf6";
const MIN_WINDOW_MS = 6 * 60 * 60 * 1000;
const MIN_IDLE_GAP_MS = 5 * 60 * 1000;

export function buildLocalDayRange(day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, dayEnd, dayDurationMs: dayEnd.getTime() - dayStart.getTime() };
}

export function formatCompactDuration(totalSeconds: number) {
  const roundedMinutes = Math.max(0, Math.round(totalSeconds / 60));
  if (roundedMinutes < 60) return `${roundedMinutes}m`;

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function taskColorForSession(session: Pick<FocusSession, "taskId">) {
  if (!session.taskId) return UNASSIGNED_COLOR;
  return TASK_PALETTE[stableHash(session.taskId) % TASK_PALETTE.length];
}

function isTerminalSession(session: FocusSession): session is FocusSession & { status: "completed" | "partial"; endedAt: string } {
  return (session.status === "completed" || session.status === "partial") && Boolean(session.endedAt);
}

function finiteTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function clipInterval(interval: TimeInterval, bounds: TimeInterval): TimeInterval | null {
  const startMs = Math.max(interval.startMs, bounds.startMs);
  const endMs = Math.min(interval.endMs, bounds.endMs);
  return endMs > startMs ? { startMs, endMs } : null;
}

function mergeIntervals(intervals: TimeInterval[]) {
  const sorted = intervals.slice().sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: TimeInterval[] = [];
  let hadOverlapOrAdjacency = false;

  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.startMs > previous.endMs) {
      merged.push({ ...interval });
      continue;
    }

    hadOverlapOrAdjacency = true;
    previous.endMs = Math.max(previous.endMs, interval.endMs);
  }

  return { intervals: merged, hadOverlapOrAdjacency };
}

function subtractIntervals(source: TimeInterval, subtractors: TimeInterval[]) {
  const result: TimeInterval[] = [];
  let cursor = source.startMs;

  for (const subtractor of subtractors) {
    if (subtractor.startMs > cursor) result.push({ startMs: cursor, endMs: subtractor.startMs });
    cursor = Math.max(cursor, subtractor.endMs);
  }

  if (cursor < source.endMs) result.push({ startMs: cursor, endMs: source.endMs });
  return result;
}

function intervalSeconds(interval: TimeInterval) {
  return Math.max(0, (interval.endMs - interval.startMs) / 1000);
}

function titleForSession(session: FocusSession, taskTitleById: Map<string, string>, fallbackTitle: string) {
  return (
    session.taskPathSnapshot?.trim() ||
    session.intention?.trim() ||
    (session.taskId ? taskTitleById.get(session.taskId) : null) ||
    fallbackTitle
  );
}

export function buildCanonicalSessionTimeline(input: { session: FocusSession; pauses: TimerPause[] }): CanonicalSessionTimeline | null {
  const { session } = input;
  if (!isTerminalSession(session)) return null;

  const sessionStartMs = finiteTime(session.startedAt);
  const sessionEndMs = finiteTime(session.endedAt);
  if (sessionStartMs === null || sessionEndMs === null || sessionEndMs <= sessionStartMs) {
    return null;
  }

  let hasTimingAnomaly = session.actualSeconds <= 0;
  const sessionBounds = { startMs: sessionStartMs, endMs: sessionEndMs };
  const pauseIntervals: TimeInterval[] = [];

  for (const pause of input.pauses) {
    if (pause.sessionId !== session.id) continue;

    const rawStartMs = finiteTime(pause.startedAt);
    const rawEndMs = pause.endedAt ? finiteTime(pause.endedAt) : sessionEndMs;
    if (rawStartMs === null || rawEndMs === null) {
      hasTimingAnomaly = true;
      continue;
    }

    if (pause.endedAt === null || rawStartMs < sessionStartMs || rawEndMs > sessionEndMs || rawEndMs <= rawStartMs) {
      hasTimingAnomaly = true;
    }

    const clipped = clipInterval({ startMs: rawStartMs, endMs: rawEndMs }, sessionBounds);
    if (clipped) pauseIntervals.push(clipped);
  }

  const normalizedPauses = mergeIntervals(pauseIntervals);
  if (normalizedPauses.hadOverlapOrAdjacency) hasTimingAnomaly = true;

  const availableFocusIntervals = subtractIntervals(sessionBounds, normalizedPauses.intervals);
  const availableFocusSeconds = availableFocusIntervals.reduce((total, interval) => total + intervalSeconds(interval), 0);

  let remainingMs = Math.max(0, session.actualSeconds * 1000);
  const focusIntervals: TimeInterval[] = [];
  for (const interval of availableFocusIntervals) {
    if (remainingMs <= 0) break;

    const availableMs = interval.endMs - interval.startMs;
    const consumedMs = Math.min(remainingMs, availableMs);
    if (consumedMs > 0) {
      focusIntervals.push({ startMs: interval.startMs, endMs: interval.startMs + consumedMs });
    }
    remainingMs -= consumedMs;
  }

  if (remainingMs > 1000) hasTimingAnomaly = true;

  return {
    sessionId: session.id,
    sessionStartMs,
    sessionEndMs,
    focusIntervals,
    pauseIntervals: normalizedPauses.intervals,
    availableFocusSeconds,
    consumedFocusSeconds: focusIntervals.reduce((total, interval) => total + intervalSeconds(interval), 0),
    hasTimingAnomaly,
  };
}

function makeSegment(input: {
  interval: TimeInterval;
  index: number;
  kind: TimelineSegmentKind;
  session: FocusSession;
  title: string;
  color: string;
}): TimelineSegment {
  return {
    id: `${input.kind}-${input.session.id}-${input.index}`,
    sessionId: input.session.id,
    kind: input.kind,
    taskId: input.session.taskId,
    title: input.title,
    color: input.kind === "focus" ? input.color : "#94a3b8",
    startAt: new Date(input.interval.startMs),
    endAt: new Date(input.interval.endMs),
    startMs: input.interval.startMs,
    endMs: input.interval.endMs,
    durationSeconds: intervalSeconds(input.interval),
  };
}

function floorToHour(date: Date) {
  const result = new Date(date);
  result.setMinutes(0, 0, 0);
  return result;
}

function ceilToHour(date: Date) {
  const result = new Date(date);
  if (result.getMinutes() || result.getSeconds() || result.getMilliseconds()) {
    result.setHours(result.getHours() + 1, 0, 0, 0);
  } else {
    result.setMinutes(0, 0, 0);
  }
  return result;
}

function addHours(date: Date, hours: number) {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

function buildViewWindow(segments: TimelineSegment[], dayStart: Date, dayEnd: Date, showFullDay?: boolean) {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  if (showFullDay || segments.length === 0) return { viewStart: dayStart, viewEnd: dayEnd };

  const sorted = segments.slice().sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  let viewStartMs = Math.max(dayStartMs, addHours(floorToHour(sorted[0].startAt), -1).getTime());
  let viewEndMs = Math.min(dayEndMs, addHours(ceilToHour(sorted.at(-1)!.endAt), 1).getTime());

  if (viewEndMs - viewStartMs < MIN_WINDOW_MS) {
    const missingMs = MIN_WINDOW_MS - (viewEndMs - viewStartMs);
    viewStartMs = Math.max(dayStartMs, viewStartMs - missingMs / 2);
    viewEndMs = Math.min(dayEndMs, viewEndMs + missingMs / 2);

    if (viewEndMs - viewStartMs < MIN_WINDOW_MS) {
      if (viewStartMs === dayStartMs) viewEndMs = Math.min(dayEndMs, viewStartMs + MIN_WINDOW_MS);
      if (viewEndMs === dayEndMs) viewStartMs = Math.max(dayStartMs, viewEndMs - MIN_WINDOW_MS);
    }
  }

  return { viewStart: new Date(viewStartMs), viewEnd: new Date(viewEndMs) };
}

function buildIdleGaps(segments: TimelineSegment[]) {
  const activeIntervals = mergeIntervals(
    segments
      .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs }))
      .filter((interval) => interval.endMs > interval.startMs),
  ).intervals;
  const gaps: TimelineGap[] = [];

  for (let index = 0; index < activeIntervals.length - 1; index += 1) {
    const current = activeIntervals[index];
    const next = activeIntervals[index + 1];
    if (next.startMs - current.endMs >= MIN_IDLE_GAP_MS) {
      gaps.push({
        id: `gap-${index}-${current.endMs}-${next.startMs}`,
        startAt: new Date(current.endMs),
        endAt: new Date(next.startMs),
        startMs: current.endMs,
        endMs: next.startMs,
        durationSeconds: (next.startMs - current.endMs) / 1000,
      });
    }
  }

  return gaps;
}

export function sumCanonicalFocusSecondsForRange(input: { sessions: FocusSession[]; pauses: TimerPause[]; start: Date; end: Date }) {
  const bounds = { startMs: input.start.getTime(), endMs: input.end.getTime() };
  return input.sessions.reduce((total, session) => {
    const canonical = buildCanonicalSessionTimeline({ session, pauses: input.pauses });
    if (!canonical || canonical.sessionStartMs >= bounds.endMs || canonical.sessionEndMs <= bounds.startMs) return total;

    return (
      total +
      canonical.focusIntervals.reduce((sessionTotal, interval) => {
        const clipped = clipInterval(interval, bounds);
        return sessionTotal + (clipped ? intervalSeconds(clipped) : 0);
      }, 0)
    );
  }, 0);
}

export function buildDailyTimelineModel(input: {
  sessions: FocusSession[];
  pauses: TimerPause[];
  tasks: Task[];
  day: Date;
  fallbackTitle: string;
  showFullDay?: boolean;
}): DailyTimelineModel {
  const { dayStart, dayEnd } = buildLocalDayRange(input.day);
  const dayBounds = { startMs: dayStart.getTime(), endMs: dayEnd.getTime() };
  const taskTitleById = new Map(input.tasks.map((task) => [task.id, task.title]));
  const focusSegments: TimelineSegment[] = [];
  const pauseSegments: TimelineSegment[] = [];
  const sessions: TimelineSessionSummary[] = [];

  for (const session of input.sessions) {
    const canonical = buildCanonicalSessionTimeline({ session, pauses: input.pauses });
    if (!canonical || canonical.sessionStartMs >= dayBounds.endMs || canonical.sessionEndMs <= dayBounds.startMs) continue;

    const title = titleForSession(session, taskTitleById, input.fallbackTitle);
    const color = taskColorForSession(session);
    const clippedFocusIntervals = canonical.focusIntervals.map((interval) => clipInterval(interval, dayBounds)).filter((interval): interval is TimeInterval => Boolean(interval));
    const clippedPauseIntervals = canonical.pauseIntervals.map((interval) => clipInterval(interval, dayBounds)).filter((interval): interval is TimeInterval => Boolean(interval));
    const focusSeconds = clippedFocusIntervals.reduce((total, interval) => total + intervalSeconds(interval), 0);
    const pauseSeconds = clippedPauseIntervals.reduce((total, interval) => total + intervalSeconds(interval), 0);

    clippedFocusIntervals.forEach((interval, index) => {
      focusSegments.push(makeSegment({ interval, index, kind: "focus", session, title, color }));
    });
    clippedPauseIntervals.forEach((interval, index) => {
      pauseSegments.push(makeSegment({ interval, index, kind: "pause", session, title, color }));
    });

    sessions.push({
      sessionId: session.id,
      taskId: session.taskId,
      title,
      color,
      startAt: new Date(canonical.sessionStartMs),
      endAt: new Date(canonical.sessionEndMs),
      focusSeconds,
      pauseSeconds,
      status: session.status as "completed" | "partial",
      summary: session.summary,
      hasTimingAnomaly: canonical.hasTimingAnomaly,
    });
  }

  focusSegments.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  pauseSegments.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  sessions.sort((left, right) => left.startAt.getTime() - right.startAt.getTime() || left.endAt.getTime() - right.endAt.getTime());

  const totalFocusSeconds = focusSegments.reduce((total, segment) => total + segment.durationSeconds, 0);
  const longestSessionSeconds = sessions.reduce((longest, session) => Math.max(longest, session.focusSeconds), 0);
  const { viewStart, viewEnd } = buildViewWindow([...focusSegments, ...pauseSegments], dayStart, dayEnd, input.showFullDay);

  return {
    dayStart,
    dayEnd,
    viewStart,
    viewEnd,
    focusSegments,
    pauseSegments,
    idleGaps: buildIdleGaps([...focusSegments, ...pauseSegments]),
    sessions,
    totalFocusSeconds,
    longestSessionSeconds,
    sessionCount: sessions.length,
    anomalyCount: sessions.filter((session) => session.hasTimingAnomaly).length,
  };
}

export function projectTimeToPercent(timeMs: number, viewStartMs: number, viewEndMs: number) {
  const durationMs = viewEndMs - viewStartMs;
  if (durationMs <= 0) return 0;
  return ((timeMs - viewStartMs) / durationMs) * 100;
}

export function projectDurationToPercent(durationSeconds: number, viewStartMs: number, viewEndMs: number) {
  const durationMs = viewEndMs - viewStartMs;
  if (durationMs <= 0) return 0;
  return (durationSeconds * 1000 / durationMs) * 100;
}
