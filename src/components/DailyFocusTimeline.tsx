"use client";

import { useMemo, useState } from "react";
import {
  buildDailyTimelineModel,
  formatCompactDuration,
  projectDurationToPercent,
  projectTimeToPercent,
  type DailyTimelineModel,
  type TimelineSessionSummary,
} from "@/lib/services/timeline";
import type { FocusSession, Task, TimerPause } from "@/types/domain";

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
  pauseDuration: string;
  status: string;
  showFullDay: string;
  showActiveWindow: string;
  timingAnomaly: string;
  timingAnomalyCount: string;
  shortSessions: string;
  summary: string;
};

type TimelineAnnotation =
  | {
      kind: "session";
      sessionId: string;
      idealTopPx: number;
      layoutTopPx: number;
    }
  | {
      kind: "collapsed";
      sessionIds: string[];
      idealTopPx: number;
      layoutTopPx: number;
    };

const ANNOTATION_HEIGHT_PX = 42;
const ANNOTATION_GAP_PX = 8;
const COLLAPSE_CLUSTER_PX = 140;
const MAX_VISIBLE_CLUSTER_ITEMS = 3;

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

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatRange(start: Date, end: Date) {
  return `${formatTime(start)}–${formatTime(end)}`;
}

function timelineHeightFor(model: DailyTimelineModel) {
  const hours = (model.viewEnd.getTime() - model.viewStart.getTime()) / (60 * 60 * 1000);
  return Math.round(Math.min(1080, Math.max(520, hours * 92)));
}

function buildHourMarks(viewStart: Date, viewEnd: Date) {
  const viewDurationHours = (viewEnd.getTime() - viewStart.getTime()) / (60 * 60 * 1000);
  const stepHours = viewDurationHours > 14 ? 2 : 1;
  const marks: Date[] = [];
  const cursor = new Date(viewStart);
  cursor.setMinutes(0, 0, 0);
  if (cursor.getTime() < viewStart.getTime()) cursor.setHours(cursor.getHours() + 1);

  while (cursor.getTime() <= viewEnd.getTime()) {
    marks.push(new Date(cursor));
    cursor.setHours(cursor.getHours() + stepHours);
  }

  return marks;
}

function buildAnnotations(model: DailyTimelineModel, timelineHeight: number): TimelineAnnotation[] {
  const viewStartMs = model.viewStart.getTime();
  const viewEndMs = model.viewEnd.getTime();
  const items = model.sessions
    .map((session) => ({
      sessionId: session.sessionId,
      idealTopPx: Math.max(
        0,
        Math.min(
          timelineHeight - ANNOTATION_HEIGHT_PX,
          (projectTimeToPercent(Math.max(session.startAt.getTime(), viewStartMs), viewStartMs, viewEndMs) / 100) * timelineHeight,
        ),
      ),
    }))
    .sort((left, right) => left.idealTopPx - right.idealTopPx);

  const collapsed: Array<{ kind: "session"; sessionId: string; idealTopPx: number } | { kind: "collapsed"; sessionIds: string[]; idealTopPx: number }> = [];
  for (let index = 0; index < items.length; ) {
    const cluster = [items[index]];
    let nextIndex = index + 1;
    while (nextIndex < items.length && items[nextIndex].idealTopPx - cluster[0].idealTopPx < COLLAPSE_CLUSTER_PX) {
      cluster.push(items[nextIndex]);
      nextIndex += 1;
    }

    cluster.slice(0, MAX_VISIBLE_CLUSTER_ITEMS).forEach((item) => collapsed.push({ kind: "session", ...item }));
    const hidden = cluster.slice(MAX_VISIBLE_CLUSTER_ITEMS);
    if (hidden.length > 0) {
      collapsed.push({
        kind: "collapsed",
        sessionIds: hidden.map((item) => item.sessionId),
        idealTopPx: hidden[0].idealTopPx,
      });
    }
    index = nextIndex;
  }

  let latestBottom = -Infinity;
  return collapsed.map((item) => {
    const layoutTopPx = Math.min(timelineHeight - ANNOTATION_HEIGHT_PX, Math.max(item.idealTopPx, latestBottom + ANNOTATION_GAP_PX));
    latestBottom = layoutTopPx + ANNOTATION_HEIGHT_PX;
    return { ...item, layoutTopPx };
  });
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

function SelectedSessionDetail({ copy, selectedSession }: { copy: TimelineCopy; selectedSession: TimelineSessionSummary | null }) {
  return (
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
              <dd className="mt-1 font-mono font-semibold tabular-nums">{formatRange(selectedSession.startAt, selectedSession.endAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">{copy.duration}</dt>
              <dd className="mt-1 font-semibold">{formatCompactDuration(selectedSession.focusSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">{copy.pauseDuration}</dt>
              <dd className="mt-1 font-semibold">{formatCompactDuration(selectedSession.pauseSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">{copy.status}</dt>
              <dd className="mt-1 font-semibold capitalize">{selectedSession.status}</dd>
            </div>
            {selectedSession.summary ? (
              <div>
                <dt className="text-xs text-[var(--muted)]">{copy.summary}</dt>
                <dd className="mt-1 text-[var(--muted-strong)]">{selectedSession.summary}</dd>
              </div>
            ) : null}
          </dl>
          {selectedSession.hasTimingAnomaly ? (
            <p className="mt-4 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs font-medium text-[var(--warning-text)]">
              {copy.timingAnomaly}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-[1.25rem] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">{copy.noSessionsForDay}</p>
      )}
    </aside>
  );
}

export function DailyFocusTimeline({
  copy,
  language,
  sessions,
  pauses,
  tasks,
}: {
  copy: TimelineCopy;
  language: "en" | "zh";
  sessions: FocusSession[];
  pauses: TimerPause[];
  tasks: Task[];
}) {
  const [timelineDay, setTimelineDay] = useState(() => startOfLocalDay(new Date()));
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showFullDay, setShowFullDay] = useState(false);
  const model = useMemo(
    () =>
      buildDailyTimelineModel({
        sessions,
        pauses,
        tasks,
        day: timelineDay,
        fallbackTitle: copy.unassigned,
        showFullDay,
      }),
    [copy.unassigned, pauses, sessions, showFullDay, tasks, timelineDay],
  );
  const selectedSession = model.sessions.find((session) => session.sessionId === selectedSessionId) ?? model.sessions[0] ?? null;
  const timelineHeight = timelineHeightFor(model);
  const hourMarks = useMemo(() => buildHourMarks(model.viewStart, model.viewEnd), [model.viewEnd, model.viewStart]);
  const annotations = useMemo(() => buildAnnotations(model, timelineHeight), [model, timelineHeight]);
  const viewStartMs = model.viewStart.getTime();
  const viewEndMs = model.viewEnd.getTime();
  const isToday = isSameLocalDay(timelineDay, new Date());
  const sessionById = new Map(model.sessions.map((session) => [session.sessionId, session]));

  return (
    <section aria-label={copy.timeline} className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_var(--shadow-line)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Timeline</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{copy.timeline}</h3>
        </div>
        <nav className="flex items-center gap-2" aria-label={copy.timeline}>
          <button
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] text-[var(--muted-strong)] transition hover:bg-[var(--surface-soft)]"
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
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] text-[var(--muted-strong)] transition hover:bg-[var(--surface-soft)]"
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
        <TimelineMetric label={copy.totalFocused} value={formatCompactDuration(model.totalFocusSeconds)} tone="accent" />
        <TimelineMetric label={copy.sessionCount} value={String(model.sessionCount)} />
        <TimelineMetric label={copy.longestSession} value={formatCompactDuration(model.longestSessionSeconds)} tone="warm" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] bg-[var(--surface-soft)] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {formatTime(model.viewStart)}–{formatTime(model.viewEnd)}
          {model.anomalyCount > 0 ? (
            <span className="ml-2 rounded-full bg-[var(--warning-bg)] px-2 py-1 text-[var(--warning-text)] normal-case tracking-normal">
              {model.anomalyCount} {copy.timingAnomalyCount}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-strong)] transition hover:-translate-y-0.5 hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
          onClick={() => setShowFullDay((current) => !current)}
        >
          {showFullDay ? copy.showActiveWindow : copy.showFullDay}
        </button>
      </div>

      <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.38fr)]">
        <div className="relative max-h-[760px] min-h-[520px] overflow-y-auto rounded-[1.6rem] border border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),var(--surface-soft))] px-3 py-5 sm:px-5">
          <div className="grid grid-cols-[4.5rem_1.25rem_minmax(0,1fr)] gap-3" style={{ height: timelineHeight }}>
            <div className="relative font-mono text-[11px] text-[var(--muted-strong)]">
              {hourMarks.map((mark) => (
                <span
                  key={mark.toISOString()}
                  className="absolute -translate-y-1/2 tabular-nums"
                  style={{ top: `${projectTimeToPercent(mark.getTime(), viewStartMs, viewEndMs)}%` }}
                >
                  {formatTime(mark)}
                </span>
              ))}
            </div>

            <div className="relative" aria-label="Timeline rail">
              <div className="absolute left-1/2 top-0 h-full w-[5px] -translate-x-1/2 rounded-full bg-[var(--border)]" />
              {model.pauseSegments.map((segment) => {
                const top = projectTimeToPercent(segment.startMs, viewStartMs, viewEndMs);
                const height = projectDurationToPercent(segment.durationSeconds, viewStartMs, viewEndMs);
                return (
                  <span
                    key={segment.id}
                    className="absolute left-1/2 w-[11px] -translate-x-1/2 rounded-full bg-[var(--muted)] opacity-40 ring-2 ring-[var(--surface)]"
                    style={{ top: `${top}%`, height: `max(${height}%, 4px)` }}
                    aria-hidden="true"
                  />
                );
              })}
              {model.focusSegments.map((segment) => {
                const top = projectTimeToPercent(segment.startMs, viewStartMs, viewEndMs);
                const height = projectDurationToPercent(segment.durationSeconds, viewStartMs, viewEndMs);
                const visualHeightPx = Math.max((height / 100) * timelineHeight, 3);
                const hitHeightPx = Math.max(visualHeightPx, 16);
                const selected = selectedSession?.sessionId === segment.sessionId;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    className="absolute left-1/2 w-6 -translate-x-1/2 rounded-full bg-transparent transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    aria-label={`${segment.title} ${formatRange(segment.startAt, segment.endAt)}`}
                    onClick={() => setSelectedSessionId(segment.sessionId)}
                    style={{
                      top: `${top}%`,
                      height: hitHeightPx,
                    }}
                  >
                    <span
                      data-testid={`timeline-focus-segment-${segment.sessionId}`}
                      className="absolute left-1/2 top-0 w-5 -translate-x-1/2 rounded-full ring-[var(--surface)]"
                      style={{
                        height: visualHeightPx,
                        backgroundColor: segment.color,
                        boxShadow: selected ? `0 0 0 4px ${segment.color}30` : "0 0 0 3px var(--surface)",
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="relative">
              {model.sessions.length === 0 ? (
                <div className="absolute left-0 top-1/2 max-w-[28ch] -translate-y-1/2 rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted)] shadow-[0_1px_0_var(--shadow-line)]">
                  {copy.noSessionsForDay}
                </div>
              ) : null}

              {model.idleGaps.map((gap) => (
                <div
                  key={gap.id}
                  className="absolute left-3 text-xs font-medium leading-tight text-[var(--muted)]"
                  style={{ top: `${projectTimeToPercent(gap.startMs + (gap.endMs - gap.startMs) / 2, viewStartMs, viewEndMs)}%` }}
                >
                  {copy.idle} · {formatCompactDuration(gap.durationSeconds)}
                </div>
              ))}

              {annotations.map((annotation) => {
                if (annotation.kind === "collapsed") {
                  return (
                    <button
                      key={`collapsed-${annotation.sessionIds.join("-")}`}
                      type="button"
                      className="absolute left-0 h-[42px] w-full max-w-[31rem] rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 text-left text-xs font-semibold text-[var(--muted-strong)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                      style={{ top: annotation.layoutTopPx }}
                      onClick={() => setSelectedSessionId(annotation.sessionIds[0] ?? null)}
                    >
                      +{annotation.sessionIds.length} {copy.shortSessions}
                    </button>
                  );
                }

                const session = sessionById.get(annotation.sessionId);
                if (!session) return null;
                const selected = selectedSession?.sessionId === session.sessionId;
                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    className={`absolute left-0 flex h-[42px] w-full max-w-[31rem] items-center justify-between gap-3 rounded-2xl border px-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                      selected
                        ? "border-[var(--accent-border)] bg-[var(--surface)] shadow-[0_14px_34px_rgba(10,20,18,0.08)]"
                        : "border-transparent bg-[var(--surface)]/70 hover:border-[var(--border)]"
                    }`}
                    style={{ top: annotation.layoutTopPx }}
                    onClick={() => setSelectedSessionId(session.sessionId)}
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] font-semibold tabular-nums text-[var(--muted-strong)]">
                        {formatRange(session.startAt, session.endAt)}
                      </span>
                      <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{session.title}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums" style={{ color: session.color }}>
                      {formatCompactDuration(session.focusSeconds)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <SelectedSessionDetail copy={copy} selectedSession={selectedSession} />
      </div>
    </section>
  );
}
