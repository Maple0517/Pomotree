"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Circle, ExternalLink, Globe2, Lightbulb, Monitor, Moon, Pause, Pencil, Play, Settings, Square, Sun, Timer } from "lucide-react";
import { getTaskPathIds } from "@/lib/services/taskSelectors";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeRemainingSeconds, formatClock } from "@/lib/utils/timer";
import type { FocusSession, Task, UserSettings } from "@/types/domain";
import { CloudSyncPanel } from "@/components/CloudSyncPanel";

type AppLanguage = NonNullable<UserSettings["language"]>;
type DurationPreset = 25 | 50 | "custom";
type ThemeSetting = UserSettings["theme"];
type MenubarMode = "idle" | "running" | "paused" | "finishing";
type FinishStatus = "completed" | "partial";
type MenubarView = "focus" | "settings";

type ActionState = {
  busy: boolean;
  message: string | null;
};

type MenubarCopy = {
  appSettings: string;
  attribution: string;
  back: string;
  capturePlaceholder: string;
  custom: string;
  dashboard: string;
  defaultFocus: string;
  discard: string;
  duration: string;
  english: string;
  finish: string;
  focusComplete: string;
  focused: string;
  greatWork: string;
  intent: string;
  language: string;
  languageHelp: string;
  light: string;
  dark: string;
  system: string;
  theme: string;
  themeHelp: string;
  noActiveSession: string;
  noGoal: string;
  pausedStatus: string;
  pause: string;
  quickCapture: string;
  ready: string;
  recentFocus: string;
  recorded: string;
  resume: string;
  saveCompleted: string;
  saveCapture: string;
  savePartial: string;
  saved: string;
  settingsHint: string;
  startFocus: string;
  startUnassigned: string;
  task: string;
  tip: string;
  tipAfterCapture: string;
  unassigned: string;
  whatComplete: string;
  whatWorking: string;
  writeSummary: string;
  zh: string;
};

const TEXT: Record<AppLanguage, MenubarCopy> = {
  en: {
    appSettings: "Settings",
    attribution: "Attribution",
    back: "Back",
    capturePlaceholder: "Something on your mind?",
    custom: "Custom",
    dashboard: "Open Dashboard",
    defaultFocus: "Default focus",
    discard: "Discard",
    duration: "Duration",
    english: "English",
    finish: "Finish",
    focusComplete: "Focus complete",
    focused: "focused",
    greatWork: "Great work! You stayed focused.",
    intent: "Intent",
    language: "Language",
    languageHelp: "Choose the language used across Pomotree.",
    light: "Light",
    dark: "Dark",
    system: "System",
    theme: "Appearance",
    themeHelp: "Choose light, dark, or follow your system setting.",
    noActiveSession: "No active session",
    noGoal: "No goal written",
    pausedStatus: "Paused",
    pause: "Pause",
    quickCapture: "Quick capture",
    ready: "Ready to focus",
    recentFocus: "Recent focus",
    recorded: "Recorded:",
    resume: "Resume",
    saveCompleted: "Save Completed",
    saveCapture: "Save capture",
    savePartial: "Save Partial",
    saved: "Saved",
    settingsHint: "Settings are saved locally on this device.",
    startFocus: "Start Focus",
    startUnassigned: "Start unassigned",
    task: "Task",
    tip: "Set an intention to stay focused and make progress.",
    tipAfterCapture: "Capture it, then continue your focus without breaking flow.",
    unassigned: "Unassigned / intention",
    whatComplete: "What did you complete?",
    whatWorking: "What are you working on?",
    writeSummary: "Write a short summary...",
    zh: "中文",
  },
  zh: {
    appSettings: "设置",
    attribution: "归属任务",
    back: "返回",
    capturePlaceholder: "突然想到什么？",
    custom: "自定义",
    dashboard: "打开 Dashboard",
    defaultFocus: "默认专注时长",
    discard: "丢弃",
    duration: "时长",
    english: "English",
    finish: "完成",
    focusComplete: "专注完成",
    focused: "已专注",
    greatWork: "做得好！你保持了专注。",
    intent: "意图",
    language: "语言",
    languageHelp: "选择 Pomotree 的显示语言。",
    light: "日间",
    dark: "夜间",
    system: "跟随系统",
    theme: "外观",
    themeHelp: "选择日间、夜间，或跟随系统设置。",
    noActiveSession: "当前没有专注",
    noGoal: "未填写目标",
    pausedStatus: "已暂停",
    pause: "暂停",
    quickCapture: "快速记录",
    ready: "准备开始专注",
    recentFocus: "最近专注",
    recorded: "已记录：",
    resume: "继续",
    saveCompleted: "保存完成",
    saveCapture: "保存记录",
    savePartial: "保存部分完成",
    saved: "已保存",
    settingsHint: "设置会保存在本机。",
    startFocus: "开始专注",
    startUnassigned: "不绑定任务开始",
    task: "任务",
    tip: "设定一个意图，帮你保持专注并推进进度。",
    tipAfterCapture: "先记录下来，然后继续专注，不打断思路。",
    unassigned: "未分配 / 仅意图",
    whatComplete: "你完成了什么？",
    whatWorking: "你正在做什么？",
    writeSummary: "写一个简短总结...",
    zh: "中文",
  },
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
  const toneClass = tone === "hot" ? "bg-[#ff5a1f] text-white shadow-[0_10px_24px_rgba(255,90,31,0.24)] disabled:bg-[var(--menubar-soft)] disabled:text-[var(--menubar-muted)]" : "bg-[#17191c] text-white shadow-[0_10px_24px_rgba(17,19,21,0.16)] disabled:bg-[var(--menubar-soft)] disabled:text-[var(--menubar-muted)]";

  return (
    <button
      type={type}
      disabled={disabled}
      form={form}
      name={name}
      onClick={onClick}
      value={value}
      className={`menubar-button h-[54px] w-full rounded-[10px] px-4 text-[17px] font-semibold ${toneClass} disabled:opacity-100`}
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

function TomatoLogo() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff2ef] ring-1 ring-[#efc3ba]/70">
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
        <path
          d="M16 10.1c5.55 0 9.9 3.75 9.9 9.25 0 5.05-3.98 8.95-9.9 8.95s-9.9-3.9-9.9-8.95c0-5.5 4.35-9.25 9.9-9.25Z"
          fill="#e84432"
        />
        <path
          d="M16 10.1c-1.95-2.38-4.05-3.35-6.75-3.05 1.18 2.6 3.15 3.88 6.75 3.05Z"
          fill="#4f9c58"
        />
        <path
          d="M16 10.1c1.95-2.38 4.05-3.35 6.75-3.05-1.18 2.6-3.15 3.88-6.75 3.05Z"
          fill="#3d8d4d"
        />
        <path d="M16 11.2c-.55-2.45-.12-4.25 1.45-5.95 1.1 2.18.76 4.1-1.45 5.95Z" fill="#2f7d43" />
        <path d="M11.4 17.1c.82-2.05 2.6-3.12 4.95-3.12" fill="none" stroke="#ff7a68" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

function OpenDashboardButton({ copy }: { copy: MenubarCopy }) {
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
        <TomatoLogo />
        <span>{copy.dashboard}</span>
      </span>
      <ExternalLink size={23} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

function SettingsButton({ copy, onClick }: { copy: MenubarCopy; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={copy.appSettings}
      title={copy.appSettings}
      onClick={onClick}
      className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border border-[var(--menubar-border)] bg-[var(--menubar-control-bg)] text-[var(--menubar-text)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65),0_8px_18px_rgba(17,19,21,0.08)]"
    >
      <Settings size={21} strokeWidth={2.2} />
    </button>
  );
}

function IdleStartForm({
  copy,
  tasks,
  defaultFocusSeconds,
  onCanStartChange,
  onStart,
}: {
  copy: MenubarCopy;
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
  const quickTasks = activeTasks.slice(0, 2);
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

  const selectQuickTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    onCanStartChange(true);
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
          {copy.intent}
        </label>
        <input
          id="menubar-intention"
          value={intention}
          onChange={(event) => updateIntention(event.target.value)}
          className="h-[58px] w-full rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 text-[16px] font-medium outline-none placeholder:text-[var(--menubar-placeholder)]"
          placeholder={copy.whatWorking}
        />
      </div>

      {activeTasks.length ? (
        <div className="grid gap-3">
          <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-task">{copy.task}</label>
          <div className="relative">
            <select
              id="menubar-task"
              value={selectedTaskId ?? ""}
              onChange={(event) => updateSelectedTaskId(event.target.value)}
              className="h-[46px] w-full appearance-none rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 pr-10 text-[15px] font-medium outline-none"
            >
              <option value="">{copy.startUnassigned}</option>
              {activeTasks.map((task) => (
                <option key={task.id} value={task.id}>{taskPath(tasks, task.id) ?? task.title}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--menubar-muted)]" size={18} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3">
        <p className="text-[15px] font-medium text-[var(--menubar-muted-strong)]">{copy.duration}</p>
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
                {preset === "custom" ? copy.custom : `${preset} min`}
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

      {quickTasks.length ? (
        <div className="grid gap-2">
          <p className="text-[13px] font-bold text-[var(--menubar-muted)]">{copy.recentFocus}</p>
          <div className="grid gap-2">
            {quickTasks.map((task) => {
              const selected = selectedTaskId === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => selectQuickTask(task.id)}
                  className={`menubar-button flex h-10 min-w-0 items-center justify-between rounded-[9px] border px-3 text-left text-[14px] font-semibold ${
                    selected
                      ? "border-[var(--menubar-selected-bg)] bg-[var(--menubar-selected-bg)] text-[var(--menubar-selected-text)]"
                      : "border-[var(--menubar-border)] bg-[var(--menubar-soft)] text-[var(--menubar-muted-strong)]"
                  }`}
                >
                  <span className="truncate">{taskPath(tasks, task.id) ?? task.title}</span>
                  {selected ? <Check size={16} strokeWidth={2.4} className="shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[9px] border border-[var(--menubar-border)] bg-[var(--menubar-soft)] px-4 py-3 text-[14px] leading-5 text-[var(--menubar-muted-strong)]">
          <Lightbulb size={22} strokeWidth={1.7} className="shrink-0 text-[var(--menubar-muted)]" />
          <p>{copy.tip}</p>
        </div>
      )}
    </form>
  );
}

function ContextBlock({ copy, session, tasks }: { copy: MenubarCopy; session: FocusSession; tasks: Task[] }) {
  const path = session.taskPathSnapshot ?? taskPath(tasks, session.taskId);
  const title = session.intention?.trim() || path || copy.noGoal;

  return (
    <section className="flex items-start justify-between gap-3">
      <h2 className="line-clamp-2 text-[22px] font-bold leading-[1.18] tracking-[-0.02em] text-[var(--menubar-text)]">{title}</h2>
      <button type="button" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--menubar-muted-strong)]" aria-label={copy.dashboard}>
        <Pencil size={21} strokeWidth={1.8} />
      </button>
    </section>
  );
}

function MenubarInterruptionInput({ copy, disabled, onSave, showFlowHint = true }: { copy: MenubarCopy; disabled?: boolean; onSave: (text: string) => Promise<void>; showFlowHint?: boolean }) {
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
        {copy.quickCapture}
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
          className="h-[52px] w-full rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent px-4 pr-12 text-[16px] font-medium outline-none placeholder:text-[var(--menubar-placeholder)] disabled:opacity-50"
          placeholder={copy.capturePlaceholder}
        />
        <button
          type="button"
          disabled={disabled || !draft.trim()}
          onClick={() => void save()}
          aria-label={copy.saveCapture}
          className="menubar-button absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[var(--menubar-selected-bg)] text-[var(--menubar-selected-text)] disabled:bg-transparent disabled:text-[var(--menubar-muted)]"
        >
          <Check size={16} strokeWidth={2.4} />
        </button>
      </div>
      {savedText ? (
        <p className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-[var(--menubar-muted-strong)]">
          <CheckCircle2 size={19} className="shrink-0 text-[#52d348]" />
          <span className="truncate">{copy.recorded} {savedText}</span>
        </p>
      ) : null}
      {showFlowHint ? (
        <p className="flex items-center gap-2 rounded-[8px] bg-[var(--menubar-soft)] px-4 py-2.5 text-[13px] font-semibold text-[var(--menubar-muted)]">
          <Circle size={15} /> {copy.tipAfterCapture}
        </p>
      ) : null}
    </section>
  );
}

function RunningStage({ copy, session, tasks, busy, onInterruption }: { copy: MenubarCopy; session: FocusSession; tasks: Task[]; busy: boolean; onInterruption: (text: string) => Promise<void> }) {
  return (
    <div className="grid gap-[22px]">
      <ContextBlock copy={copy} session={session} tasks={tasks} />
      <MenubarInterruptionInput copy={copy} disabled={busy} onSave={onInterruption} />
    </div>
  );
}

function PausedStage({ copy, session, tasks, busy, onInterruption }: { copy: MenubarCopy; session: FocusSession; tasks: Task[]; busy: boolean; onInterruption: (text: string) => Promise<void> }) {
  return (
    <div className="grid gap-[18px]">
      <ContextBlock copy={copy} session={session} tasks={tasks} />
      <MenubarInterruptionInput copy={copy} disabled={busy} onSave={onInterruption} showFlowHint={false} />
    </div>
  );
}

function FinishForm({
  copy,
  session,
  tasks,
  onSave,
}: {
  copy: MenubarCopy;
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
            <h2 className="text-[19px] font-bold tracking-[-0.02em] text-[var(--menubar-text)]">{copy.focusComplete}</h2>
            <p className="mt-2 text-[16px] font-medium text-[var(--menubar-muted-strong)]">{copy.greatWork}</p>
          </div>
        </div>
        <div className="mt-1 flex gap-6 border-b border-[var(--menubar-border)] pb-3 text-[14px] text-[var(--menubar-muted-strong)]">
          <span className="font-bold text-[var(--menubar-text)]">{Math.round(session.plannedSeconds / 60)} min</span>
          <span>{copy.focused}</span>
        </div>
      </section>

      <div className="grid gap-3">
        <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-summary">{copy.whatComplete}</label>
        <div className="relative">
          <textarea
            id="menubar-summary"
            maxLength={120}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onKeyDown={onTextareaKeyDown}
            className="h-[78px] w-full resize-none rounded-[9px] border border-[var(--menubar-border-strong)] bg-transparent p-3 pr-14 text-[14px] font-medium outline-none placeholder:text-[var(--menubar-placeholder)]"
            placeholder={copy.writeSummary}
          />
          <span className="absolute bottom-3 right-3 text-[13px] font-semibold text-[var(--menubar-muted)]">{summaryLength}/120</span>
        </div>
      </div>
      <div className="grid gap-3">
        <label className="text-[15px] font-medium text-[var(--menubar-muted-strong)]" htmlFor="menubar-attribution">{copy.attribution}</label>
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
            <option value="">{copy.unassigned}</option>
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
  copy,
  mode,
  busy,
  canStartIdleFocus,
  onPause,
  onFinish,
  onResume,
  onDiscard,
}: {
  copy: MenubarCopy;
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
        <SecondaryButton disabled={busy} onClick={onPause}><IconText icon={<Pause size={20} fill="currentColor" />}>{copy.pause}</IconText></SecondaryButton>
        <PrimaryButton tone="hot" disabled={busy} onClick={onFinish}><IconText icon={<Square size={16} fill="currentColor" />}>{copy.finish}</IconText></PrimaryButton>
      </div>
    );
  }

  if (mode === "paused") {
    return (
      <div className="grid grid-cols-2 gap-3 px-5 pb-[18px] pt-3">
        <PrimaryButton disabled={busy} onClick={onResume}><IconText icon={<Play size={18} fill="currentColor" />}>{copy.resume}</IconText></PrimaryButton>
        <SecondaryButton disabled={busy} onClick={onDiscard}>{copy.discard}</SecondaryButton>
        <div className="col-span-2"><PrimaryButton tone="hot" disabled={busy} onClick={onFinish}>{copy.finish}</PrimaryButton></div>
      </div>
    );
  }

  if (mode === "finishing") {
    return (
      <div className="relative z-10 grid gap-2 px-5 pb-[12px] pt-1">
        <button
          type="submit"
          form={MENUBAR_FORMS.finish}
          name="status"
          value="completed"
          disabled={busy}
          className="menubar-button h-12 w-full rounded-[10px] bg-[#17191c] px-4 text-[16px] font-semibold text-white shadow-[0_10px_24px_rgba(17,19,21,0.16)] disabled:bg-[var(--menubar-soft)] disabled:text-[var(--menubar-muted)]"
        >
          {copy.saveCompleted}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            form={MENUBAR_FORMS.finish}
            name="status"
            value="partial"
            disabled={busy}
            className="menubar-button h-11 rounded-[10px] border border-[var(--menubar-border-strong)] bg-transparent px-3 text-[15px] font-semibold text-[var(--menubar-text)] disabled:opacity-75"
          >
            {copy.savePartial}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="menubar-button h-11 rounded-[10px] border border-[var(--menubar-border-strong)] bg-transparent px-3 text-[15px] font-semibold text-[var(--menubar-text)] disabled:opacity-75"
          >
            {copy.discard}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-[16px] pt-3">
      <PrimaryButton type="submit" form={MENUBAR_FORMS.idle} disabled={busy || !canStartIdleFocus}>
        <IconText icon={<Play size={19} fill="currentColor" />}>{copy.startFocus}</IconText>
      </PrimaryButton>
    </div>
  );
}

function MenubarHeader({ activeSession, copy, onSettings, remainingSeconds }: { activeSession: FocusSession | undefined; copy: MenubarCopy; onSettings: () => void; remainingSeconds: number }) {
  if (!activeSession) {
    return (
      <header className="flex items-start justify-between gap-3 px-5 pt-[22px]">
        <div className="flex min-w-0 items-start gap-3">
          <Circle className="mt-1 shrink-0 text-[var(--menubar-muted-strong)]" size={23} strokeWidth={2} />
          <div>
            <h1 className="text-[22px] font-bold leading-7 tracking-[-0.03em] text-[var(--menubar-text)]">{copy.ready}</h1>
            <p className="mt-1 text-[15px] font-medium text-[var(--menubar-muted)]">{copy.noActiveSession}</p>
          </div>
        </div>
        <SettingsButton copy={copy} onClick={onSettings} />
      </header>
    );
  }

  if (activeSession.status === "finishing") return null;

  const isPaused = activeSession.status === "paused";

  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-[22px]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--menubar-soft)] text-[var(--menubar-muted-strong)]" aria-hidden="true">{isPaused ? <Pause size={22} fill="currentColor" /> : <Timer size={24} strokeWidth={2.2} />}</span>
        <div className="min-w-0">
          <h1 className="text-[38px] font-bold leading-none tracking-[-0.04em] text-[var(--menubar-text)]">{formatClock(remainingSeconds)}</h1>
          {isPaused ? <p className="mt-1 text-[13px] font-bold text-[var(--menubar-muted)]">{copy.pausedStatus}</p> : null}
        </div>
      </div>
      <SettingsButton copy={copy} onClick={onSettings} />
    </header>
  );
}

function SettingsPanel({ copy, language, settings, onBack, onChangeLanguage, onChangeFocusMinutes, onChangeTheme }: { copy: MenubarCopy; language: AppLanguage; settings: UserSettings; onBack: () => void; onChangeLanguage: (language: AppLanguage) => void; onChangeFocusMinutes: (minutes: number) => void; onChangeTheme: (theme: ThemeSetting) => void }) {
  const focusMinutes = Math.round(settings.defaultFocusSeconds / 60);
  const languageOptions: Array<{ label: string; value: AppLanguage }> = [
    { label: copy.english, value: "en" },
    { label: copy.zh, value: "zh" },
  ];
  const themeOptions: Array<{ icon: React.ReactNode; label: string; value: ThemeSetting }> = [
    { icon: <Sun size={17} />, label: copy.light, value: "light" },
    { icon: <Moon size={17} />, label: copy.dark, value: "dark" },
    { icon: <Monitor size={17} />, label: copy.system, value: "system" },
  ];

  return (
    <div className="grid gap-5 px-5 pt-[22px]">
      <header className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label={copy.back} className="grid h-[42px] w-[42px] place-items-center rounded-full border border-[var(--menubar-border)] bg-[var(--menubar-control-bg)] text-[var(--menubar-text)]">
          <ArrowLeft size={21} />
        </button>
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--menubar-text)]">{copy.appSettings}</h1>
          <p className="mt-1 text-[14px] font-medium text-[var(--menubar-muted)]">{copy.settingsHint}</p>
        </div>
      </header>

      <section className="grid gap-3 rounded-[16px] border border-[var(--menubar-border)] bg-[var(--menubar-soft)] p-4">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 shrink-0 text-[var(--menubar-muted-strong)]" size={20} />
          <div>
            <h2 className="text-[16px] font-bold text-[var(--menubar-text)]">{copy.language}</h2>
            <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--menubar-muted-strong)]">{copy.languageHelp}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {languageOptions.map((option) => {
            const selected = language === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChangeLanguage(option.value)}
                className={`menubar-button h-11 rounded-[10px] border text-[15px] font-bold ${selected ? "border-[var(--menubar-selected-bg)] bg-[var(--menubar-selected-bg)] text-[var(--menubar-selected-text)]" : "border-[var(--menubar-border-strong)] bg-[var(--menubar-control-bg)] text-[var(--menubar-text)]"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>


      <section className="grid gap-3 rounded-[16px] border border-[var(--menubar-border)] bg-[var(--menubar-soft)] p-4">
        <div className="flex items-start gap-3">
          <Sun className="mt-0.5 shrink-0 text-[var(--menubar-muted-strong)]" size={20} />
          <div>
            <h2 className="text-[16px] font-bold text-[var(--menubar-text)]">{copy.theme}</h2>
            <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--menubar-muted-strong)]">{copy.themeHelp}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((option) => {
            const selected = settings.theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChangeTheme(option.value)}
                className={`menubar-button inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-bold ${selected ? "border-[var(--menubar-selected-bg)] bg-[var(--menubar-selected-bg)] text-[var(--menubar-selected-text)]" : "border-[var(--menubar-border-strong)] bg-[var(--menubar-control-bg)] text-[var(--menubar-text)]"}`}
              >
                {option.icon}
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 rounded-[16px] border border-[var(--menubar-border)] bg-[var(--menubar-soft)] p-4">
        <h2 className="text-[16px] font-bold text-[var(--menubar-text)]">{copy.defaultFocus}</h2>
        <div className="grid grid-cols-3 gap-2">
          {[25, 50, 90].map((minutes) => {
            const selected = focusMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                onClick={() => onChangeFocusMinutes(minutes)}
                className={`menubar-button h-11 rounded-[10px] border text-[15px] font-bold ${selected ? "border-[var(--menubar-selected-bg)] bg-[var(--menubar-selected-bg)] text-[var(--menubar-selected-text)]" : "border-[var(--menubar-border-strong)] bg-[var(--menubar-control-bg)] text-[var(--menubar-text)]"}`}
              >
                {minutes} min
              </button>
            );
          })}
        </div>
      </section>

      <CloudSyncPanel language={language} variant="menubar" />
    </div>
  );
}

export function MenubarApp() {
  const {
    settings,
    tasks,
    sessions,
    pauses,
    hydrate,
    updateSettings,
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
  const [view, setView] = useState<MenubarView>("focus");
  const [action, setAction] = useState<ActionState>({ busy: false, message: null });
  const [canStartIdleFocus, setCanStartIdleFocus] = useState(false);
  const lastTrayTitleRef = useRef<string | null>(null);
  const lastCompletionSoundSessionRef = useRef<string | null>(null);
  const language = settings.language ?? "en";
  const copy = TEXT[language];

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.dataset.theme = settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
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
        invokeTauriCommand("present_focus_complete_alert");
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
    <main className="h-[560px] w-[380px] overflow-hidden bg-transparent text-[var(--menubar-text)]">
      <section className="menubar-shell isolate flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-[var(--menubar-border)] [background:var(--menubar-surface)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "settings" ? (
            <SettingsPanel
              copy={copy}
              language={language}
              settings={settings}
              onBack={() => setView("focus")}
              onChangeLanguage={(nextLanguage) => void runAction(() => updateSettings({ language: nextLanguage }), "Failed to update language")}
              onChangeFocusMinutes={(minutes) => void runAction(() => updateSettings({ defaultFocusSeconds: minutes * 60 }), "Failed to update duration")}
              onChangeTheme={(theme) => void runAction(() => updateSettings({ theme }), "Failed to update theme")}
            />
          ) : (
            <>
              <MenubarHeader activeSession={activeSession} copy={copy} onSettings={() => setView("settings")} remainingSeconds={remainingSeconds} />

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
                      copy={copy}
                      session={activeSession}
                      tasks={tasks}
                      busy={busy}
                      onInterruption={(text) => createInterruption(text)}
                    />
                  ) : activeSession?.status === "paused" ? (
                    <PausedStage
                      copy={copy}
                      session={activeSession}
                      tasks={tasks}
                      busy={busy}
                      onInterruption={(text) => createInterruption(text)}
                    />
                  ) : activeSession?.status === "finishing" ? (
                    <FinishForm
                      copy={copy}
                      session={activeSession}
                      tasks={tasks}
                      onSave={(input) => runAction(async () => {
                        await saveFinish(input);
                        setCanStartIdleFocus(false);
                      }, "Failed to save session")}
                    />
                  ) : (
                    <IdleStartForm
                      copy={copy}
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
            </>
          )}
        </div>

        {view === "focus" ? (
          <ActionBar
            copy={copy}
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
        ) : null}

        {view === "focus" ? (
          <div className="overflow-hidden rounded-b-[32px] border-t border-[var(--menubar-border)]">
            <OpenDashboardButton copy={copy} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
