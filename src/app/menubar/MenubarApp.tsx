"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { getTaskPathIds } from "@/lib/services/taskSelectors";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeRemainingSeconds, formatClock } from "@/lib/utils/timer";
import type { FocusSession, Task } from "@/types/domain";

type DurationPreset = 25 | 50 | "custom";
type MenubarMode = "idle" | "running" | "paused" | "finishing";
type FinishStatus = "completed" | "partial";

type ActionState = {
  busy: boolean;
  message: string | null;
};

const MENUBAR_WINDOW = {
  width: 380,
  height: 560,
} as const;

const SHELL_LAYOUT = {
  headerHeight: 44,
  actionBarHeight: 116,
} as const;

const MENUBAR_FORMS = {
  idle: "menubar-idle-start-form",
  finish: "menubar-finish-form",
} as const;

function menubarMode(session: FocusSession | undefined): MenubarMode {
  if (session?.status === "running" || session?.status === "paused" || session?.status === "finishing") {
    return session.status;
  }

  return "idle";
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

function PrimaryButton({ children, disabled, form, name, onClick, type = "button", value }: { children: React.ReactNode; disabled?: boolean; form?: string; name?: string; onClick?: () => void; type?: "button" | "submit"; value?: string }) {
  return (
    <button
      type={type}
      disabled={disabled}
      form={form}
      name={name}
      onClick={onClick}
      value={value}
      className="h-11 w-full rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, disabled, form, name, onClick, type = "button", value }: { children: React.ReactNode; disabled?: boolean; form?: string; name?: string; onClick?: () => void; type?: "button" | "submit"; value?: string }) {
  return (
    <button
      type={type}
      disabled={disabled}
      form={form}
      name={name}
      onClick={onClick}
      value={value}
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
      className="flex h-10 items-center justify-between rounded-xl px-1 text-sm font-medium text-[var(--muted-strong)] hover:text-[var(--foreground)]"
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

function RunningStage({ session, tasks, busy, onInterruption }: { session: FocusSession; tasks: Task[]; busy: boolean; onInterruption: (text: string) => Promise<void> }) {
  return (
    <>
      <ContextBlock session={session} tasks={tasks} />
      <MenubarInterruptionInput disabled={busy} onSave={onInterruption} />
    </>
  );
}

function PausedStage({ session, tasks, busy, onInterruption }: { session: FocusSession; tasks: Task[]; busy: boolean; onInterruption: (text: string) => Promise<void> }) {
  return (
    <>
      <ContextBlock session={session} tasks={tasks} />
      <MenubarInterruptionInput disabled={busy} onSave={onInterruption} />
    </>
  );
}

function FinishForm({
  session,
  tasks,
  onSave,
}: {
  session: FocusSession;
  tasks: Task[];
  onSave: (input: { status: FinishStatus; summary: string; taskId?: string | null }) => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined);
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "archived" && task.status !== "done"), [tasks]);
  const currentTaskPath = session.taskPathSnapshot ?? taskPath(tasks, session.taskId);
  const effectiveTaskId = selectedTaskId === undefined ? session.taskId : selectedTaskId;

  const submit = async (status: FinishStatus) => {
    await onSave({ status, summary, taskId: selectedTaskId });
    setSummary("");
    setSelectedTaskId(undefined);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value === "partial" ? "partial" : "completed";
    void submit(status);
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit("completed");
    }
  };

  return (
    <form id={MENUBAR_FORMS.finish} className="grid gap-4" onSubmit={onSubmit}>
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
    </form>
  );
}

function IdleStartForm({
  tasks,
  defaultFocusSeconds,
  onCanStartChange,
  onStart,
}: {
  tasks: Task[];
  defaultFocusSeconds: number;
  onCanStartChange: (canStart: boolean) => void;
  onStart: (taskId: string | null, intention: string, plannedSeconds: number) => Promise<void>;
}) {
  const [intention, setIntention] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(defaultFocusSeconds === 3000 ? 50 : 25);
  const [customMinutes, setCustomMinutes] = useState(String(Math.max(1, Math.round(defaultFocusSeconds / 60))));
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "archived" && task.status !== "done"), [tasks]);
  const plannedSeconds = durationPreset === "custom" ? Math.max(1, Number(customMinutes) || 1) * 60 : durationPreset * 60;
  const canStart = Boolean(intention.trim() || selectedTaskId);
  const noTasks = activeTasks.length === 0;

  const updateIntention = (value: string) => {
    setIntention(value);
    onCanStartChange(Boolean(value.trim() || selectedTaskId));
  };

  const updateSelectedTaskId = (value: string) => {
    const nextTaskId = value || null;
    setSelectedTaskId(nextTaskId);
    onCanStartChange(Boolean(intention.trim() || nextTaskId));
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canStart) return;
    await onStart(selectedTaskId, intention.trim(), plannedSeconds);
    setIntention("");
  };

  return (
    <form id={MENUBAR_FORMS.idle} className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <label className="text-[15px] font-semibold" htmlFor="menubar-intention">
          {noTasks ? "Start with an intention" : "What are you focusing on?"}
        </label>
        <input
          id="menubar-intention"
          value={intention}
          onChange={(event) => updateIntention(event.target.value)}
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
            onChange={(event) => updateSelectedTaskId(event.target.value)}
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
    </form>
  );
}

function ActionBar({
  mode,
  busy,
  canStartIdleFocus,
  onPause,
  onFinish,
  onResume,
  onDiscard,
}: {
  mode: MenubarMode;
  busy: boolean;
  canStartIdleFocus: boolean;
  onPause: () => void;
  onFinish: () => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const secondarySlots = (slots: React.ReactNode[]) => (
    <div className="grid grid-cols-2 gap-2">
      {slots.map((slot, index) => (
        <div key={index} className="h-10">
          {slot}
        </div>
      ))}
      {Array.from({ length: Math.max(0, 2 - slots.length) }).map((_, index) => (
        <div key={`empty-action-${index}`} aria-hidden="true" className="h-10" />
      ))}
    </div>
  );

  if (mode === "running") {
    return (
      <footer className="grid shrink-0 content-start gap-2 border-t border-[var(--border-subtle)] pt-3" style={{ height: SHELL_LAYOUT.actionBarHeight }}>
        <PrimaryButton disabled={busy} onClick={onFinish}>Finish</PrimaryButton>
        {secondarySlots([<SecondaryButton key="pause" disabled={busy} onClick={onPause}>Pause</SecondaryButton>])}
      </footer>
    );
  }

  if (mode === "paused") {
    return (
      <footer className="grid shrink-0 content-start gap-2 border-t border-[var(--border-subtle)] pt-3" style={{ height: SHELL_LAYOUT.actionBarHeight }}>
        <PrimaryButton disabled={busy} onClick={onResume}>Resume</PrimaryButton>
        {secondarySlots([
          <SecondaryButton key="finish" disabled={busy} onClick={onFinish}>Finish</SecondaryButton>,
          <SecondaryButton key="discard" disabled={busy} onClick={onDiscard}>Discard</SecondaryButton>,
        ])}
      </footer>
    );
  }

  if (mode === "finishing") {
    return (
      <footer className="grid shrink-0 content-start gap-2 border-t border-[var(--border-subtle)] pt-3" style={{ height: SHELL_LAYOUT.actionBarHeight }}>
        <PrimaryButton type="submit" form={MENUBAR_FORMS.finish} name="status" value="completed" disabled={busy}>Save completed</PrimaryButton>
        {secondarySlots([
          <SecondaryButton key="partial" type="submit" form={MENUBAR_FORMS.finish} name="status" value="partial" disabled={busy}>Save partial</SecondaryButton>,
        ])}
      </footer>
    );
  }

  return (
    <footer className="grid shrink-0 content-start gap-2 border-t border-[var(--border-subtle)] pt-3" style={{ height: SHELL_LAYOUT.actionBarHeight }}>
      <PrimaryButton type="submit" form={MENUBAR_FORMS.idle} disabled={busy || !canStartIdleFocus}>Start Focus</PrimaryButton>
      {secondarySlots([<OpenDashboardButton key="dashboard" />])}
    </footer>
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
  const [canStartIdleFocus, setCanStartIdleFocus] = useState(false);
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
    <main
      className="bg-[var(--surface)] text-[var(--foreground)]"
      style={{ width: MENUBAR_WINDOW.width, height: MENUBAR_WINDOW.height }}
    >
      <section className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
        <header
          className="flex shrink-0 items-center justify-between gap-3"
          style={{ height: SHELL_LAYOUT.headerHeight }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-base leading-none" aria-hidden="true">{header.icon}</span>
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


        <section className="min-h-0 overflow-y-auto py-4">
          <div className="grid gap-4">
            {!ready && loading ? <p className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--muted)]">Loading…</p> : null}
            {(error || action.message) ? (
              <p className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]">
                {action.message ?? error}
              </p>
            ) : null}

            {activeSession?.status === "running" ? (
              <RunningStage
                session={activeSession}
                tasks={tasks}
                busy={busy}
                onInterruption={(text) => createInterruption(text)}
              />
            ) : activeSession?.status === "paused" ? (
              <PausedStage
                session={activeSession}
                tasks={tasks}
                busy={busy}
                onInterruption={(text) => createInterruption(text)}
              />
            ) : activeSession?.status === "finishing" ? (
              <FinishForm
                session={activeSession}
                tasks={tasks}
                onSave={(input) => runAction(async () => {
                  await saveFinish(input);
                  setCanStartIdleFocus(false);
                }, "Failed to save session")}
              />
            ) : (
              <IdleStartForm
                tasks={tasks}
                defaultFocusSeconds={settings.defaultFocusSeconds}
                onCanStartChange={setCanStartIdleFocus}
                onStart={(taskId, intention, plannedSeconds) => runAction(async () => {
                  await startFocus(taskId, intention, plannedSeconds);
                  setCanStartIdleFocus(false);
                }, "Failed to start focus")}
              />
            )}
          </div>
        </section>

        <ActionBar
          mode={mode}
          busy={busy}
          canStartIdleFocus={canStartIdleFocus}
          onPause={() => void runAction(pauseSession, "Failed to pause session")}
          onFinish={() => void runAction(requestFinish, "Failed to finish session")}
          onResume={() => void runAction(resumeSession, "Failed to resume session")}
          onDiscard={() => void runAction(async () => {
            await discardSession();
            setCanStartIdleFocus(false);
          }, "Failed to discard session")}
        />
      </section>
    </main>
  );
}
