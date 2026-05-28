"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Circle, ExternalLink, Lightbulb, Pause, Pencil, Play, Settings, Square } from "lucide-react";
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

function PrimaryButton({ children, disabled, form, name, onClick, tone = "default", type = "button", value }: { children: React.ReactNode; disabled?: boolean; form?: string; name?: string; onClick?: () => void; tone?: "default" | "hot"; type?: "button" | "submit"; value?: string }) {
  const toneClass = tone === "hot" ? "bg-[#ff5a1f] text-white shadow-[0_10px_24px_rgba(255,90,31,0.24)]" : "bg-[#17191c] text-white shadow-[0_10px_24px_rgba(17,19,21,0.16)]";

  return (
    <button
      type={type}
      disabled={disabled}
      form={form}
      name={name}
      onClick={onClick}
      value={value}
      className={`menubar-button h-[54px] w-full rounded-[10px] px-4 text-[17px] font-semibold ${toneClass} disabled:opacity-75`}
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
      className="menubar-button h-[54px] w-full rounded-[10px] border border-[var(--menubar-border-strong)] bg-transparent px-4 text-[17px] font-semibold text-[var(--menubar-text)] disabled:opacity-75"
    >
      {children}
    </button>
  );
}

function IconText({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center justify-center gap-2.5">{icon}{children}</span>;
}

function OpenDashboardButton() {
  const openDashboard = () => {
    if (isTauriRuntime()) {
      invokeTauriCommand("open_dashboard");
      return;
    }

    window.open("/", "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={openDashboard}
      className="menubar-dashboard-row flex h-[62px] w-full items-center justify-between rounded-b-[32px] px-5 text-[14px] font-semibold text-[var(--menubar-muted-strong)]"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#17191c] text-[18px] font-semibold text-white shadow-[0_8px_18px_rgba(17,19,21,0.18)]">N</span>
        <span>Open Dashboard</span>
      </span>
      <ExternalLink size={23} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

function SettingsButton() {
  return (
    <button
      type="button"
      aria-label="Settings placeholder"
      title="Settings live in Dashboard for v0"
      className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border border-[var(--menubar-border)] bg-white/70 text-[var(--menubar-text)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65),0_8px_18px_rgba(17,19,21,0.08)]"
    >
      <Settings size={21} strokeWidth={2.2} />
    </button>
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
    <form id={MENUBAR_FORMS.idle} className="grid gap-[26px]" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3">
        <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-intention">
          Intent
        </label>
        <input
          id="menubar-intention"
          value={intention}
          onChange={(event) => updateIntention(event.target.value)}
          className="h-[58px] w-full rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 text-[16px] font-medium outline-none placeholder:text-[var(--menubar-placeholder)]"
          placeholder="What are you working on?"
        />
      </div>

      {activeTasks.length ? (
        <div className="grid gap-3">
          <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-task">Task</label>
          <div className="relative">
            <select
              id="menubar-task"
              value={selectedTaskId ?? ""}
              onChange={(event) => updateSelectedTaskId(event.target.value)}
              className="h-[46px] w-full appearance-none rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 pr-10 text-[15px] font-medium outline-none"
            >
              <option value="">Start unassigned</option>
              {activeTasks.map((task) => (
                <option key={task.id} value={task.id}>{taskPath(tasks, task.id) ?? task.title}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--menubar-muted)]" size={18} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3">
        <p className="text-[15px] font-medium text-[var(--menubar-muted-strong)]">Duration</p>
        <div className="grid grid-cols-3 gap-2.5">
          {([25, 50, "custom"] as const).map((preset) => {
            const selected = durationPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setDurationPreset(preset)}
                className={`h-[42px] rounded-[9px] border px-2 text-[15px] font-semibold ${selected ? "border-[#ebe8e3] bg-[#f3f0ec] text-[#111315] shadow-[0_8px_20px_rgba(0,0,0,0.22)]" : "border-[var(--menubar-border-strong)] bg-transparent text-[var(--menubar-muted-strong)]"}`}
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
            className="h-[42px] w-full rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 text-[15px] outline-none"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-[9px] border border-[var(--menubar-border)] bg-[var(--menubar-soft)] px-4 py-3 text-[14px] leading-5 text-[var(--menubar-muted-strong)]">
        <Lightbulb size={22} strokeWidth={1.7} className="shrink-0 text-[var(--menubar-muted)]" />
        <p>Set an intention to stay focused and make progress.</p>
      </div>
    </form>
  );
}

function ContextBlock({ session, tasks }: { session: FocusSession; tasks: Task[] }) {
  const path = session.taskPathSnapshot ?? taskPath(tasks, session.taskId);
  const title = session.intention?.trim() || path || "No goal written";

  return (
    <section className="flex items-start justify-between gap-3">
      <h2 className="line-clamp-2 text-[22px] font-bold leading-[1.18] tracking-[-0.02em] text-[var(--menubar-text)]">{title}</h2>
      <button type="button" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--menubar-muted-strong)]" aria-label="Edit in dashboard">
        <Pencil size={21} strokeWidth={1.8} />
      </button>
    </section>
  );
}

function MenubarInterruptionInput({ disabled, onSave }: { disabled?: boolean; onSave: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [savedText, setSavedText] = useState<string | null>(null);

  useEffect(() => {
    if (!savedText) return;
    const id = window.setTimeout(() => setSavedText(null), 5000);
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
    <section className="grid gap-3">
      <label className="text-[15px] font-bold text-[var(--menubar-muted-strong)]" htmlFor="menubar-interruption">
        Quick capture
      </label>
      <div className="relative">
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
          className="h-[78px] w-full rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 pr-[76px] text-[16px] font-medium outline-none placeholder:text-[var(--menubar-placeholder)] disabled:opacity-50"
          placeholder="突然想到什么？ Enter 保存"
        />
        {savedText ? (
          <span className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[12px] font-semibold text-[#52d348]">
            <CheckCircle2 size={16} /> Saved
          </span>
        ) : null}
      </div>
      {savedText ? (
        <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--menubar-muted-strong)]">
          <CheckCircle2 size={19} className="text-[#52d348]" /> 已记录：{savedText}
        </p>
      ) : null}
      <p className="flex items-center gap-2 rounded-[8px] bg-[var(--menubar-soft)] px-4 py-2.5 text-[13px] font-semibold text-[var(--menubar-muted)]">
        <Circle size={15} /> 记录后继续你的专注，不打断思路。
      </p>
    </section>
  );
}

function RunningStage({ session, tasks, busy, onInterruption }: { session: FocusSession; tasks: Task[]; busy: boolean; onInterruption: (text: string) => Promise<void> }) {
  return (
    <div className="grid gap-[22px]">
      <ContextBlock session={session} tasks={tasks} />
      <MenubarInterruptionInput disabled={busy} onSave={onInterruption} />
    </div>
  );
}

function PausedStage({ session, tasks, busy, onInterruption }: { session: FocusSession; tasks: Task[]; busy: boolean; onInterruption: (text: string) => Promise<void> }) {
  return (
    <div className="grid gap-[22px]">
      <ContextBlock session={session} tasks={tasks} />
      <MenubarInterruptionInput disabled={busy} onSave={onInterruption} />
    </div>
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
  const summaryLength = summary.length;

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
    <form id={MENUBAR_FORMS.finish} className="grid gap-[22px]" onSubmit={onSubmit}>
      <section className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#55ce46] text-white shadow-[0_10px_22px_rgba(85,206,70,0.3)]">
            <Check size={27} strokeWidth={3.2} />
          </span>
          <div>
            <h2 className="text-[19px] font-bold tracking-[-0.02em] text-[var(--menubar-text)]">Focus complete</h2>
            <p className="mt-2 text-[16px] font-medium text-[var(--menubar-muted-strong)]">Great work! You stayed focused.</p>
          </div>
        </div>
        <div className="mt-1 flex gap-6 border-b border-[var(--menubar-border)] pb-3 text-[14px] text-[var(--menubar-muted-strong)]">
          <span className="font-bold text-[var(--menubar-text)]">{Math.round(session.plannedSeconds / 60)} min</span>
          <span>focused</span>
        </div>
      </section>

      <div className="grid gap-3">
        <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-summary">What did you complete?</label>
        <div className="relative">
          <textarea
            id="menubar-summary"
            maxLength={120}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onKeyDown={onTextareaKeyDown}
            className="h-[78px] w-full resize-none rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent p-3 pr-14 text-[14px] font-medium outline-none placeholder:text-[var(--menubar-placeholder)]"
            placeholder="Write a short summary..."
          />
          <span className="absolute bottom-3 right-3 text-[13px] font-semibold text-[var(--menubar-muted)]">{summaryLength}/120</span>
        </div>
      </div>
      <div className="grid gap-3">
        <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-attribution">Attribution</label>
        <div className="relative">
          <select
            id="menubar-attribution"
            value={effectiveTaskId ?? ""}
            onChange={(event) => setSelectedTaskId(event.target.value || null)}
            className="h-[44px] w-full appearance-none rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-3 pr-10 text-[15px] font-semibold outline-none"
          >
            {session.taskId && currentTaskPath && !activeTasks.some((task) => task.id === session.taskId) ? (
              <option value={session.taskId} disabled>{currentTaskPath}</option>
            ) : null}
            <option value="">Unassigned / intention</option>
            {activeTasks.map((task) => (
              <option key={task.id} value={task.id}>{taskPath(tasks, task.id) ?? task.title}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--menubar-muted)]" size={18} />
        </div>
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
  if (mode === "running") {
    return (
      <div className="grid grid-cols-2 gap-3 px-5 pb-[18px] pt-3">
        <SecondaryButton disabled={busy} onClick={onPause}><IconText icon={<Pause size={20} fill="currentColor" />}>Pause</IconText></SecondaryButton>
        <PrimaryButton tone="hot" disabled={busy} onClick={onFinish}><IconText icon={<Square size={16} fill="currentColor" />}>Finish</IconText></PrimaryButton>
      </div>
    );
  }

  if (mode === "paused") {
    return (
      <div className="grid grid-cols-2 gap-3 px-5 pb-[18px] pt-3">
        <PrimaryButton disabled={busy} onClick={onResume}><IconText icon={<Play size={18} fill="currentColor" />}>Resume</IconText></PrimaryButton>
        <SecondaryButton disabled={busy} onClick={onDiscard}>Discard</SecondaryButton>
        <div className="col-span-2"><PrimaryButton tone="hot" disabled={busy} onClick={onFinish}>Finish</PrimaryButton></div>
      </div>
    );
  }

  if (mode === "finishing") {
    return (
      <div className="relative z-10 px-5 pb-[22px] pt-1">
        <PrimaryButton type="submit" form={MENUBAR_FORMS.finish} name="status" value="completed" disabled={busy}>Save Completed</PrimaryButton>
      </div>
    );
  }

  return (
    <div className="px-5 pb-[16px] pt-3">
      <PrimaryButton type="submit" form={MENUBAR_FORMS.idle} disabled={busy || !canStartIdleFocus}>
        <IconText icon={<Play size={19} fill="currentColor" />}>Start Focus</IconText>
      </PrimaryButton>
    </div>
  );
}

function MenubarHeader({ activeSession, remainingSeconds }: { activeSession: FocusSession | undefined; remainingSeconds: number }) {
  if (!activeSession) {
    return (
      <header className="flex items-start justify-between gap-3 px-5 pt-[22px]">
        <div className="flex min-w-0 items-start gap-3">
          <Circle className="mt-1 shrink-0 text-[var(--menubar-muted-strong)]" size={23} strokeWidth={2} />
          <div>
            <h1 className="text-[22px] font-bold leading-7 tracking-[-0.03em] text-[var(--menubar-text)]">Ready to focus</h1>
            <p className="mt-1 text-[15px] font-medium text-[var(--menubar-muted)]">No active session</p>
          </div>
        </div>
        <SettingsButton />
      </header>
    );
  }

  if (activeSession.status === "finishing") return null;

  const isPaused = activeSession.status === "paused";

  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-[22px]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[34px] leading-none" aria-hidden="true">{isPaused ? "⏸" : "🍅"}</span>
        <h1 className="text-[38px] font-bold leading-none tracking-[-0.04em] text-[var(--menubar-text)]">{isPaused ? `${formatClock(remainingSeconds)} paused` : formatClock(remainingSeconds)}</h1>
      </div>
      <SettingsButton />
    </header>
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
    const tauriRuntime = isTauriRuntime();
    document.documentElement.classList.add("menubar-popover-root");
    document.body.classList.add("menubar-popover-body");
    if (tauriRuntime) {
      document.documentElement.classList.add("menubar-tauri-root");
      document.body.classList.add("menubar-tauri-body");
    }

    return () => {
      document.documentElement.classList.remove("menubar-popover-root", "menubar-tauri-root");
      document.body.classList.remove("menubar-popover-body", "menubar-tauri-body");
    };
  }, []);

  const activeSession = sessions.find((session) => ["running", "paused", "finishing"].includes(session.status));
  const mode = menubarMode(activeSession);
  const remainingSeconds = activeSession ? computeRemainingSeconds(activeSession, pauses, now) : settings.defaultFocusSeconds;
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
  const contentPadding = activeSession?.status === "finishing" ? "px-5 pt-5 pb-0" : "px-5 pt-[26px] pb-2";

  return (
    <main
      className="h-[560px] w-[380px] overflow-hidden bg-transparent text-[var(--menubar-text)]"
    >
      <section className="menubar-shell isolate flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-[var(--menubar-border)] [background:var(--menubar-surface)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MenubarHeader activeSession={activeSession} remainingSeconds={remainingSeconds} />

          <section className={contentPadding}>
            <div className="grid gap-4">
              {!ready && loading ? <p className="rounded-[9px] bg-[var(--menubar-soft)] px-3 py-2 text-sm text-[var(--menubar-muted)]">Loading…</p> : null}
              {(error || action.message) ? (
                <p className="rounded-[9px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]">
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
        </div>

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

        <div className="overflow-hidden rounded-b-[32px] border-t border-[var(--menubar-border)]">
          <OpenDashboardButton />
        </div>
      </section>
    </main>
  );
}
