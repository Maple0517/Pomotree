"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { getTaskPathIds } from "@/lib/services/taskSelectors";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeRemainingSeconds, formatClock } from "@/lib/utils/timer";
import type { FocusSession, Task } from "@/types/domain";

type DurationPreset = 25 | 50 | "custom";
type MenubarMode = "idle" | "running" | "paused" | "finishing";

type ActionState = {
  busy: boolean;
  message: string | null;
};

const MENUBAR_WINDOW_WIDTH = 380;
const MENUBAR_HEIGHT_LIMITS: Record<MenubarMode, { min: number; max: number }> = {
  idle: { min: 320, max: 430 },
  running: { min: 340, max: 470 },
  paused: { min: 380, max: 500 },
  finishing: { min: 440, max: 580 },
};

function menubarMode(session: FocusSession | undefined): MenubarMode {
  if (session?.status === "running" || session?.status === "paused" || session?.status === "finishing") {
    return session.status;
  }

  return "idle";
}

function targetWindowHeight(mode: MenubarMode, measuredPanelHeight: number) {
  const limits = MENUBAR_HEIGHT_LIMITS[mode];
  const contentHeight = Math.ceil(measuredPanelHeight);
  return Math.min(limits.max, Math.max(limits.min, contentHeight));
}

function taskPath(tasks: Task[], taskId: string | null | undefined) {
  if (!taskId) return null;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return getTaskPathIds(tasks, taskId)
    .map((id) => byId.get(id)?.title)
    .filter(Boolean)
    .join(" / ");
}

function statusHeader(session: FocusSession | undefined, remainingSeconds: number) {
  if (!session) return { icon: "○", text: "Ready to focus" };
  if (session.status === "finishing") return { icon: "✅", text: "Focus complete" };
  if (session.status === "paused") return { icon: "⏸", text: `${formatClock(remainingSeconds)} paused` };
  return { icon: "🍅", text: formatClock(remainingSeconds) };
}

function menubarStatusTitle(session: FocusSession | undefined, remainingSeconds: number) {
  if (!session) return "🍅";
  if (session.status === "finishing") return "✅ Done";
  if (session.status === "paused") return `⏸ ${formatClock(remainingSeconds)}`;
  if (session.status === "running") return `🍅 ${formatClock(remainingSeconds)}`;
  return "🍅";
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function invokeTauriCommand(command: string, args?: Record<string, unknown>) {
  if (!isTauriRuntime()) return;

  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke(command, args))
    .catch(() => {});
}

function PrimaryButton({ children, disabled, onClick, type = "button" }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="h-11 w-full rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, disabled, onClick, type = "button" }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function OpenDashboardButton() {
  return (
    <Link
      href="/"
      className="flex items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-[var(--muted-strong)] hover:text-[var(--foreground)]"
    >
      <span>Open Dashboard</span>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

function ContextBlock({ session, tasks }: { session: FocusSession; tasks: Task[] }) {
  const path = session.taskPathSnapshot ?? taskPath(tasks, session.taskId);
  const hasGoal = Boolean(session.intention?.trim());

  return (
    <section className="grid gap-3">
      {path ? <p className="line-clamp-2 text-[13px] leading-5 text-[var(--muted)]">{path}</p> : null}
      {hasGoal || !path ? (
        <div className="grid gap-1.5">
          {path ? <p className="text-xs font-medium text-[var(--muted)]">Goal</p> : null}
          <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-[var(--foreground)]">
            {session.intention?.trim() || "No goal written"}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function MenubarInterruptionInput({ disabled, onSave }: { disabled?: boolean; onSave: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [savedText, setSavedText] = useState<string | null>(null);

  useEffect(() => {
    if (!savedText) return;
    const id = window.setTimeout(() => setSavedText(null), 2000);
    return () => window.clearTimeout(id);
  }, [savedText]);

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    await onSave(text);
    setDraft("");
    setSavedText(text);
  };

  return (
    <section className="grid gap-2">
      <label className="text-xs font-medium text-[var(--muted)]" htmlFor="menubar-interruption">
        Interruption
      </label>
      <input
        id="menubar-interruption"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none placeholder:text-[var(--placeholder)] disabled:opacity-50"
        placeholder="突然想到什么？Enter 保存"
      />
      {savedText ? (
        <div className="rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] px-3 py-2 text-sm text-[var(--info-text)]">
          <p className="font-semibold">✅ Interruption saved</p>
          <p className="mt-0.5 line-clamp-2">已记录：{savedText}</p>
        </div>
      ) : null}
    </section>
  );
}

function RunningState({ session, tasks, busy, onPause, onFinish, onInterruption }: { session: FocusSession; tasks: Task[]; busy: boolean; onPause: () => void; onFinish: () => void; onInterruption: (text: string) => Promise<void> }) {
  return (
    <>
      <ContextBlock session={session} tasks={tasks} />
      <MenubarInterruptionInput disabled={busy} onSave={onInterruption} />
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton disabled={busy} onClick={onPause}>Pause</SecondaryButton>
        <PrimaryButton disabled={busy} onClick={onFinish}>Finish</PrimaryButton>
      </div>
    </>
  );
}

function PausedState({ session, tasks, busy, onResume, onFinish, onDiscard, onInterruption }: { session: FocusSession; tasks: Task[]; busy: boolean; onResume: () => void; onFinish: () => void; onDiscard: () => void; onInterruption: (text: string) => Promise<void> }) {
  return (
    <>
      <ContextBlock session={session} tasks={tasks} />
      <PrimaryButton disabled={busy} onClick={onResume}>Resume</PrimaryButton>
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton disabled={busy} onClick={onFinish}>Finish</SecondaryButton>
        <SecondaryButton disabled={busy} onClick={onDiscard}>Discard</SecondaryButton>
      </div>
      <MenubarInterruptionInput disabled={busy} onSave={onInterruption} />
    </>
  );
}

function FinishForm({ session, tasks, busy, onSave }: { session: FocusSession; tasks: Task[]; busy: boolean; onSave: (input: { status: "completed" | "partial"; summary: string; taskId?: string | null }) => Promise<void> }) {
  const [summary, setSummary] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined);
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "archived" && task.status !== "done"), [tasks]);
  const currentTaskPath = session.taskPathSnapshot ?? taskPath(tasks, session.taskId);
  const effectiveTaskId = selectedTaskId === undefined ? session.taskId : selectedTaskId;

  const submit = async (status: "completed" | "partial") => {
    await onSave({ status, summary, taskId: selectedTaskId });
    setSummary("");
    setSelectedTaskId(undefined);
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit("completed");
    }
  };

  return (
    <section className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-[15px] font-semibold" htmlFor="menubar-summary">What did you complete?</label>
        <textarea
          id="menubar-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          onKeyDown={onTextareaKeyDown}
          className="min-h-28 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
          placeholder="Write a short summary..."
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs font-medium text-[var(--muted)]" htmlFor="menubar-attribution">Attribution</label>
        <select
          id="menubar-attribution"
          value={effectiveTaskId ?? ""}
          onChange={(event) => setSelectedTaskId(event.target.value || null)}
          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none"
        >
          {session.taskId && currentTaskPath && !activeTasks.some((task) => task.id === session.taskId) ? (
            <option value={session.taskId} disabled>{currentTaskPath}</option>
          ) : null}
          <option value="">Unassigned / intention</option>
          {activeTasks.map((task) => (
            <option key={task.id} value={task.id}>{taskPath(tasks, task.id) ?? task.title}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <PrimaryButton disabled={busy} onClick={() => void submit("completed")}>Save completed</PrimaryButton>
        <SecondaryButton disabled={busy} onClick={() => void submit("partial")}>Save partial</SecondaryButton>
      </div>
    </section>
  );
}

function IdleStartForm({ tasks, defaultFocusSeconds, busy, onStart }: { tasks: Task[]; defaultFocusSeconds: number; busy: boolean; onStart: (taskId: string | null, intention: string, plannedSeconds: number) => Promise<void> }) {
  const [intention, setIntention] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(defaultFocusSeconds === 3000 ? 50 : 25);
  const [customMinutes, setCustomMinutes] = useState(String(Math.max(1, Math.round(defaultFocusSeconds / 60))));
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "archived" && task.status !== "done"), [tasks]);
  const plannedSeconds = durationPreset === "custom" ? Math.max(1, Number(customMinutes) || 1) * 60 : durationPreset * 60;
  const canStart = Boolean(intention.trim() || selectedTaskId);
  const noTasks = activeTasks.length === 0;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canStart) return;
    await onStart(selectedTaskId, intention.trim(), plannedSeconds);
    setIntention("");
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <label className="text-[15px] font-semibold" htmlFor="menubar-intention">
          {noTasks ? "Start with an intention" : "What are you focusing on?"}
        </label>
        <input
          id="menubar-intention"
          value={intention}
          onChange={(event) => setIntention(event.target.value)}
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
          placeholder={noTasks ? "What are you working on?" : "输入任务或意图..."}
        />
      </div>
      {activeTasks.length ? (
        <div className="grid gap-2">
          <label className="text-xs font-medium text-[var(--muted)]" htmlFor="menubar-task">Select task</label>
          <select
            id="menubar-task"
            value={selectedTaskId ?? ""}
            onChange={(event) => setSelectedTaskId(event.target.value || null)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none"
          >
            <option value="">Start unassigned</option>
            {activeTasks.map((task) => (
              <option key={task.id} value={task.id}>{taskPath(tasks, task.id) ?? task.title}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-2">
        <p className="text-xs font-medium text-[var(--muted)]">Duration</p>
        <div className="grid grid-cols-3 gap-2">
          {([25, 50, "custom"] as const).map((preset) => {
            const selected = durationPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setDurationPreset(preset)}
                className={`h-9 rounded-xl border px-2 text-sm font-medium ${selected ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--surface)]"}`}
              >
                {preset === "custom" ? "Custom" : `${preset} min`}
              </button>
            );
          })}
        </div>
        {durationPreset === "custom" ? (
          <input
            aria-label="Custom minutes"
            type="number"
            min={1}
            max={240}
            inputMode="numeric"
            value={customMinutes}
            onChange={(event) => setCustomMinutes(event.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none"
          />
        ) : null}
      </div>
      <PrimaryButton type="submit" disabled={!canStart || busy}>Start Focus</PrimaryButton>
    </form>
  );
}

export function MenubarApp() {
  const {
    settings,
    tasks,
    sessions,
    pauses,
    hydrate,
    startFocus,
    pauseSession,
    resumeSession,
    requestFinish,
    discardSession,
    saveFinish,
    createInterruption,
    expireRunningSession,
    ready,
    loading,
    error,
  } = useAppStore();
  const [now, setNow] = useState(() => Date.now());
  const [action, setAction] = useState<ActionState>({ busy: false, message: null });
  const panelRef = useRef<HTMLElement | null>(null);
  const lastTrayTitleRef = useRef<string | null>(null);
  const lastCompletionSoundSessionRef = useRef<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = settings.theme === "system" ? (prefersDark ? "dark" : "light") : settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.classList.add("menubar-popover-root");
    document.body.classList.add("menubar-popover-body");

    return () => {
      document.documentElement.classList.remove("menubar-popover-root");
      document.body.classList.remove("menubar-popover-body");
    };
  }, []);

  const activeSession = sessions.find((session) => ["running", "paused", "finishing"].includes(session.status));
  const mode = menubarMode(activeSession);
  const remainingSeconds = activeSession ? computeRemainingSeconds(activeSession, pauses, now) : settings.defaultFocusSeconds;
  const header = statusHeader(activeSession, remainingSeconds);
  const trayTitle = menubarStatusTitle(activeSession, remainingSeconds);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window) || !panelRef.current) return;

    let animationFrame = 0;
    let lastHeight = 0;
    const panel = panelRef.current;

    const resizeWindow = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nextHeight = targetWindowHeight(mode, panel.scrollHeight);
        if (Math.abs(nextHeight - lastHeight) < 1) return;

        lastHeight = nextHeight;
        void import("@tauri-apps/api/window")
          .then(({ LogicalSize, getCurrentWindow }) => getCurrentWindow().setSize(new LogicalSize(MENUBAR_WINDOW_WIDTH, nextHeight)))
          .catch(() => {
            // Browser preview and older shells should keep rendering even if the Tauri window API is unavailable.
          });
      });
    };

    const observer = new ResizeObserver(resizeWindow);
    observer.observe(panel);
    resizeWindow();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [mode, ready, loading, action.message]);

  useEffect(() => {
    if (!isTauriRuntime() || lastTrayTitleRef.current === trayTitle) return;

    lastTrayTitleRef.current = trayTitle;
    invokeTauriCommand("set_menubar_status", { title: trayTitle });
  }, [trayTitle]);

  useEffect(() => {
    if (activeSession?.status === "running" && remainingSeconds <= 0) {
      if (lastCompletionSoundSessionRef.current !== activeSession.id) {
        lastCompletionSoundSessionRef.current = activeSession.id;
        invokeTauriCommand("play_focus_complete_sound");
      }

      void expireRunningSession(activeSession.id);
    }
  }, [activeSession?.id, activeSession?.status, expireRunningSession, remainingSeconds]);

  const runAction = async (callback: () => Promise<void>, fallback: string) => {
    setAction({ busy: true, message: null });
    try {
      await callback();
      setAction({ busy: false, message: null });
    } catch (caught) {
      setAction({ busy: false, message: caught instanceof Error ? caught.message : fallback });
    }
  };

  const busy = action.busy || loading;

  return (
    <main className="w-[380px] bg-[var(--surface)] text-[var(--foreground)]">
      <section ref={panelRef} className="grid max-h-screen w-full gap-4 overflow-y-auto rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-lg" aria-hidden="true">{header.icon}</span>
            <p className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{header.text}</p>
          </div>
          <button
            type="button"
            aria-label="Settings placeholder"
            title="Settings live in Dashboard for v0"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border)] text-sm text-[var(--muted)]"
          >
            ⚙
          </button>
        </header>

        {!ready && loading ? <p className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--muted)]">Loading…</p> : null}
        {(error || action.message) ? (
          <p className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]">
            {action.message ?? error}
          </p>
        ) : null}

        {activeSession?.status === "running" ? (
          <RunningState
            session={activeSession}
            tasks={tasks}
            busy={busy}
            onPause={() => void runAction(pauseSession, "Failed to pause session")}
            onFinish={() => void runAction(requestFinish, "Failed to finish session")}
            onInterruption={(text) => createInterruption(text)}
          />
        ) : activeSession?.status === "paused" ? (
          <PausedState
            session={activeSession}
            tasks={tasks}
            busy={busy}
            onResume={() => void runAction(resumeSession, "Failed to resume session")}
            onFinish={() => void runAction(requestFinish, "Failed to finish session")}
            onDiscard={() => void runAction(discardSession, "Failed to discard session")}
            onInterruption={(text) => createInterruption(text)}
          />
        ) : activeSession?.status === "finishing" ? (
          <FinishForm
            session={activeSession}
            tasks={tasks}
            busy={busy}
            onSave={(input) => runAction(() => saveFinish(input), "Failed to save session")}
          />
        ) : (
          <IdleStartForm
            tasks={tasks}
            defaultFocusSeconds={settings.defaultFocusSeconds}
            busy={busy}
            onStart={(taskId, intention, plannedSeconds) => runAction(() => startFocus(taskId, intention, plannedSeconds), "Failed to start focus")}
          />
        )}

        <footer className="border-t border-[var(--border-subtle)] pt-1">
          <OpenDashboardButton />
        </footer>
      </section>
    </main>
  );
}
