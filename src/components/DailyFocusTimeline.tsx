"use client";

import { useMemo, useState } from "react";
import type { FocusSession, Task } from "@/types/domain";

type TimelineCopy = {
  today: string;
  idle: string;
  unassigned: string;
  totalFocused: string;
  sessionCount: string;
  longestSession: string;
  timeline: string;
  previousDay: string;
  nextDay: string;
  backToToday: string;
  noSessionsForDay: string;
  sessionDetail: string;
  timeRange: string;
  duration: string;
  summary: string;
};

const DAY_SECONDS = 24 * 60 * 60;
const TIMELINE_HEIGHT_PX = 900;
const SESSION_CARD_HEIGHT_PX = 58;
const SESSION_CARD_GAP_PX = 8;

type TimelineSession = FocusSession & {
  title: string;
  color: string;
  startSeconds: number;
  endSeconds: number;
  displaySeconds: number;
};

type PositionedTimelineSession = TimelineSession & {
  layoutTopPx: number;
};

type TimelineGap = {
  id: string;
  startSeconds: number;
  endSeconds: number;
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameLocalDay(left: Date, right: Date) {
  return startOfLocalDay(left).getTime() === startOfLocalDay(right).getTime();
}

function formatDayLabel(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function secondsIntoDay(date: Date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCompactDuration(totalSeconds: number) {
  const roundedMinutes = Math.max(1, Math.round(totalSeconds / 60));
  if (roundedMinutes < 60) return `${roundedMinutes}m`;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function taskColorForSession(session: FocusSession, tasks: Task[]) {
  if (!session.taskId) return "#8b5cf6";
  const taskIndex = tasks.findIndex((task) => task.id === session.taskId);
  const palette = ["#16a34a", "#2563eb", "#7c3aed", "#ea580c", "#db2777", "#0891b2"];
  return palette[Math.max(0, taskIndex) % palette.length];
}

function buildDailyTimeline(sessions: FocusSession[], tasks: Task[], day: Date, fallbackTitle: string) {
  const dayStart = startOfLocalDay(day);
  const dayEnd = addDays(dayStart, 1);
  const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]));
  const timelineSessions: TimelineSession[] = sessions
    .filter((session) => ["completed", "partial"].includes(session.status) && session.endedAt)
    .map((session) => {
      const start = new Date(session.startedAt);
      const end = new Date(session.endedAt ?? session.startedAt);
      return { session, start, end };
    })
    .filter(({ start, end }) => start < dayEnd && end > dayStart)
    .map(({ session, start, end }) => {
      const clippedStart = start < dayStart ? dayStart : start;
      const clippedEnd = end > dayEnd ? dayEnd : end;
      const startSeconds = secondsIntoDay(clippedStart);
      const endSeconds = Math.max(startSeconds + 60, secondsIntoDay(clippedEnd));
      const title = session.taskPathSnapshot ?? session.intention ?? (session.taskId ? taskTitleById.get(session.taskId) : null) ?? fallbackTitle;

      return {
        ...session,
        title,
        color: taskColorForSession(session, tasks),
        startSeconds,
        endSeconds: Math.min(DAY_SECONDS, endSeconds),
        displaySeconds: session.actualSeconds || Math.max(60, (end.getTime() - start.getTime()) / 1000),
      };
    })
    .sort((left, right) => left.startSeconds - right.startSeconds);

  const gaps: TimelineGap[] = [];
  for (let index = 0; index < timelineSessions.length - 1; index += 1) {
    const current = timelineSessions[index];
    const next = timelineSessions[index + 1];
    if (next.startSeconds - current.endSeconds >= 5 * 60) {
      gaps.push({
        id: `${current.id}-${next.id}`,
        startSeconds: current.endSeconds,
        endSeconds: next.startSeconds,
      });
    }
  }

  return { timelineSessions, gaps };
}

function layoutTimelineSessions(sessions: TimelineSession[]): PositionedTimelineSession[] {
  const maxTop = TIMELINE_HEIGHT_PX - SESSION_CARD_HEIGHT_PX;
  const positioned = sessions.map((session) => ({
    ...session,
    layoutTopPx: Math.min(maxTop, Math.max(0, (session.startSeconds / DAY_SECONDS) * TIMELINE_HEIGHT_PX)),
  }));

  for (let index = 1; index < positioned.length; index += 1) {
    const previous = positioned[index - 1];
    const current = positioned[index];
    current.layoutTopPx = Math.max(current.layoutTopPx, previous.layoutTopPx + SESSION_CARD_HEIGHT_PX + SESSION_CARD_GAP_PX);
  }

  for (let index = positioned.length - 1; index >= 0; index -= 1) {
    const next = positioned[index + 1];
    const current = positioned[index];
    const upperBound = next ? next.layoutTopPx - SESSION_CARD_HEIGHT_PX - SESSION_CARD_GAP_PX : maxTop;
    current.layoutTopPx = Math.max(0, Math.min(current.layoutTopPx, upperBound));
  }

  return positioned;
}

function TimelineMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "warm" }) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--success)]"
      : tone === "warm"
        ? "text-[var(--accent)]"
        : "text-[var(--foreground)]";

  return (
    <div className="min-w-0 rounded-[1.4rem] bg-[var(--surface-soft)] px-4 py-3">
      <p className={`truncate text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 truncate text-[11px] font-medium text-[var(--muted)]">{label}</p>
    </div>
  );
}

export function DailyFocusTimeline({
  copy,
  language,
  sessions,
  tasks,
}: {
  copy: TimelineCopy;
  language: "en" | "zh";
  sessions: FocusSession[];
  tasks: Task[];
}) {
  const [timelineDay, setTimelineDay] = useState(() => startOfLocalDay(new Date()));
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { timelineSessions, gaps } = useMemo(
    () => buildDailyTimeline(sessions, tasks, timelineDay, copy.unassigned),
    [copy.unassigned, sessions, tasks, timelineDay],
  );
  const positionedSessions = useMemo(() => layoutTimelineSessions(timelineSessions), [timelineSessions]);
  const selectedSession = positionedSessions.find((session) => session.id === selectedSessionId) ?? positionedSessions[0] ?? null;
  const totalSeconds = timelineSessions.reduce((total, session) => total + session.displaySeconds, 0);
  const longestSeconds = timelineSessions.reduce((longest, session) => Math.max(longest, session.displaySeconds), 0);
  const hourMarks = Array.from({ length: 7 }, (_, index) => index * 4);
  const isToday = isSameLocalDay(timelineDay, new Date());

  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_var(--shadow-line)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Timeline</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{copy.timeline}</h3>
        </div>
        <nav className="flex items-center gap-2" aria-label={copy.timeline}>
          <button
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] text-[var(--muted-strong)]"
            aria-label={copy.previousDay}
            onClick={() => {
              setTimelineDay((current) => addDays(current, -1));
              setSelectedSessionId(null);
            }}
          >
            ‹
          </button>
          <p className="min-w-36 text-center text-sm font-semibold tabular-nums">{formatDayLabel(timelineDay, language)}</p>
          <button
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] text-[var(--muted-strong)]"
            aria-label={copy.nextDay}
            onClick={() => {
              setTimelineDay((current) => addDays(current, 1));
              setSelectedSessionId(null);
            }}
          >
            ›
          </button>
          <button
            className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent)] disabled:opacity-45"
            disabled={isToday}
            onClick={() => {
              setTimelineDay(startOfLocalDay(new Date()));
              setSelectedSessionId(null);
            }}
          >
            {copy.backToToday}
          </button>
        </nav>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <TimelineMetric label={copy.totalFocused} value={formatCompactDuration(totalSeconds)} tone="accent" />
        <TimelineMetric label={copy.sessionCount} value={String(timelineSessions.length)} />
        <TimelineMetric label={copy.longestSession} value={formatCompactDuration(longestSeconds)} tone="warm" />
      </div>

      <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
        <div className="relative min-h-[940px] overflow-hidden rounded-[1.6rem] border border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),var(--surface-soft))] px-3 py-5 sm:px-5">
          <div
            className="grid grid-cols-[3.2rem_1rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.2rem_1rem_minmax(0,1fr)]"
            style={{ height: TIMELINE_HEIGHT_PX }}
          >
            <div className="relative font-mono text-[11px] text-[var(--muted-strong)]">
              {hourMarks.map((hour) => (
                <span key={hour} className="absolute -translate-y-1/2 tabular-nums" style={{ top: `${(hour / 24) * 100}%` }}>
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
              <span className="absolute bottom-0 -translate-y-0 tabular-nums">24:00</span>
            </div>
            <div className="relative">
              <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-[var(--border)]" />
              {timelineSessions.map((session) => (
                <span
                  key={session.id}
                  className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-[var(--surface)]"
                  style={{ top: `${(session.startSeconds / DAY_SECONDS) * 100}%`, backgroundColor: session.color }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="relative">
              {timelineSessions.length === 0 ? (
                <div className="absolute left-0 top-1/2 max-w-[28ch] -translate-y-1/2 rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted)] shadow-[0_1px_0_var(--shadow-line)]">
                  {copy.noSessionsForDay}
                </div>
              ) : null}
              {gaps.map((gap) => (
                <div
                  key={gap.id}
                  className="absolute left-3 text-xs font-medium leading-tight text-[var(--muted-strong)]"
                  style={{ top: `${(((gap.startSeconds + gap.endSeconds) / 2) / DAY_SECONDS) * 100}%` }}
                >
                  {copy.idle} · {formatCompactDuration(gap.endSeconds - gap.startSeconds)}
                </div>
              ))}
              {positionedSessions.map((session) => {
                const start = new Date(session.startedAt);
                const end = new Date(session.endedAt ?? session.startedAt);
                const selected = selectedSession?.id === session.id;
                return (
                  <button
                    key={session.id}
                    className={`group absolute left-0 h-[58px] w-full max-w-[31rem] overflow-hidden rounded-[1.1rem] border px-3 py-2 text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 sm:px-3 ${
                      selected ? "border-[var(--border)] shadow-[0_18px_45px_rgba(10,20,18,0.08)]" : "border-transparent"
                    }`}
                    style={{
                      top: session.layoutTopPx,
                      background: `linear-gradient(135deg, ${session.color}22, ${session.color}10)`,
                      zIndex: selected ? 2 : 1,
                    }}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <span className="absolute bottom-2 left-0 top-2 w-1 rounded-full" style={{ backgroundColor: session.color }} aria-hidden="true" />
                    <span className="flex items-start justify-between gap-3 pl-2">
                      <span className="min-w-0">
                        <span className="block font-mono text-[11px] font-semibold tabular-nums text-[var(--muted-strong)]">
                          {formatTime(start)} – {formatTime(end)}
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-[var(--foreground)]">{session.title}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums" style={{ color: session.color }}>
                        {formatCompactDuration(session.displaySeconds)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="rounded-[1.6rem] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{copy.sessionDetail}</p>
          {selectedSession ? (
            <div className="mt-4 rounded-[1.25rem] bg-[var(--surface)] p-4 shadow-[0_1px_0_var(--shadow-line)]">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedSession.color }} aria-hidden="true" />
                <h4 className="min-w-0 truncate text-sm font-semibold">{selectedSession.title}</h4>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--muted)]">{copy.timeRange}</dt>
                  <dd className="mt-1 font-mono font-semibold tabular-nums">
                    {formatTime(new Date(selectedSession.startedAt))} – {formatTime(new Date(selectedSession.endedAt ?? selectedSession.startedAt))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">{copy.duration}</dt>
                  <dd className="mt-1 font-semibold">{formatCompactDuration(selectedSession.displaySeconds)}</dd>
                </div>
                {selectedSession.summary ? (
                  <div>
                    <dt className="text-xs text-[var(--muted)]">{copy.summary}</dt>
                    <dd className="mt-1 text-[var(--muted-strong)]">{selectedSession.summary}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : (
            <p className="mt-4 rounded-[1.25rem] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">{copy.noSessionsForDay}</p>
          )}
        </aside>
      </div>
    </section>
  );
}
