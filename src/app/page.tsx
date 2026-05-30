"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, ChevronDown, ChevronRight, MoreHorizontal, Sprout, Timer } from "lucide-react";
import { getActiveTaskRows, getArchivedBranchRoots, getAutoExpandedTaskIds, getTaskChildrenMap, getTaskRows } from "@/lib/services/taskSelectors";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeRemainingSeconds, formatClock } from "@/lib/utils/timer";
import { formatDuration, getTaskStats, getTodayStats } from "@/lib/services/stats";
import type { UserSettings } from "@/types/domain";
import { CloudSyncPanel } from "@/components/CloudSyncPanel";

type AppLanguage = NonNullable<UserSettings["language"]>;
type DashboardCopy = {
  add: string;
  addInterruption: string;
  addSubtask: string;
  addTaskPlaceholder: string;
  archive: string;
  archivedTasks: string;
  actualAttribution: string;
  browserNotifications: string;
  cancel: string;
  clickTaskHint: string;
  completed: string;
  convertToTask: string;
  correctAttribution: string;
  currentArchivedAttribution: string;
  currentFocus: string;
  dark: string;
  defaultFocusDuration: string;
  discard: string;
  dismiss: string;
  done: string;
  edit: string;
  exportJson: string;
  focus: string;
  focusMinutes: string;
  focusTime: string;
  finishSession: string;
  headerSubtitle: string;
  importJson: string;
  importPlaceholder: string;
  intentionLabel: string;
  intentionPlaceholder: string;
  interruptions: string;
  language: string;
  light: string;
  loading: string;
  localFirst: string;
  markAttributedDone: string;
  markDone: string;
  noArchivedTasks: string;
  noCompletedSessions: string;
  noOpenInterruptions: string;
  noTasksYet: string;
  noTaskSelected: string;
  notReady: string;
  notificationPermission: string;
  notificationPrimary: string;
  openInterruptionPlaceholder: string;
  planned: string;
  recentSessions: string;
  root: string;
  reopen: string;
  restore: string;
  restoreData: string;
  resume: string;
  save: string;
  saveCompleted: string;
  saveTask: string;
  settings: string;
  state: string;
  system: string;
  task: string;
  taskTree: string;
  theme: string;
  today: string;
  toggleTaskHint: string;
  summaryPlaceholder: string;
  pause: string;
  finish: string;
  idle: string;
  unknownTask: string;
  completedPomodoros: string;
  collapseArchived: string;
  expandArchived: string;
  focusCompleteNotification: string;
  focusCompleteBody: string;
  session: string;
  unassigned: string;
};


function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" }) {
  return (
    <div className={`rounded-[1.35rem] border p-4 ${tone === "accent" ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-transparent bg-[var(--surface-soft)]"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, action }: { icon: React.ReactNode; title: string; action?: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-4 py-7 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)] text-[var(--muted)] shadow-[0_1px_0_var(--shadow-line)]">{icon}</div>
      <p className="max-w-[34ch] text-sm font-medium text-[var(--muted-strong)]">{title}</p>
      {action ? <p className="mt-1 text-xs text-[var(--muted)]">{action}</p> : null}
    </div>
  );
}

function lastActiveSessionTaskId(sessions: Array<{ taskId: string | null; status: string; endedAt: string | null; updatedAt: string }>, activeTaskIds: Set<string>) {
  return sessions
    .filter((session) => ["completed", "partial", "discarded"].includes(session.status) && session.taskId && activeTaskIds.has(session.taskId))
    .sort((left, right) => (right.endedAt ?? right.updatedAt).localeCompare(left.endedAt ?? left.updatedAt))[0]?.taskId ?? null;
}

const DASHBOARD_TEXT: Record<AppLanguage, DashboardCopy> = {
  en: {
    add: "Add",
    addInterruption: "Add interruption",
    addSubtask: "Add subtask",
    addTaskPlaceholder: "Add a task or path, e.g. Project / Subtask",
    archive: "Archive",
    archivedTasks: "Archived Tasks",
    actualAttribution: "Actual attribution",
    browserNotifications: "Browser notifications",
    cancel: "Cancel",
    clickTaskHint: "Click task to select",
    completed: "Completed",
    convertToTask: "Convert to task",
    correctAttribution: "Correct attribution",
    currentArchivedAttribution: "Current archived attribution",
    currentFocus: "Current focus",
    dark: "Dark",
    defaultFocusDuration: "Default focus duration",
    discard: "Discard",
    dismiss: "Dismiss",
    done: "Done",
    edit: "Edit",
    exportJson: "Export JSON",
    focus: "Focus",
    focusMinutes: "Focus minutes",
    focusTime: "Focus time",
    finishSession: "Finish this focus session",
    headerSubtitle: "Focus tree, one session at a time",
    importJson: "Import JSON",
    importPlaceholder: "Paste a Pomotree export JSON object",
    intentionLabel: "Intention without a task",
    intentionPlaceholder: "e.g. Read and annotate the proposal",
    interruptions: "Interruptions",
    language: "Language",
    light: "Light",
    loading: "Loading…",
    localFirst: "Local-first MVP",
    markAttributedDone: "Mark attributed task done",
    markDone: "Mark done",
    noArchivedTasks: "No archived tasks.",
    noCompletedSessions: "No completed focus sessions yet.",
    noOpenInterruptions: "No open interruptions.",
    noTasksYet: "No tasks yet. Create your first focus tree node.",
    noTaskSelected: "No task selected",
    notReady: "Not ready",
    notificationPermission: "Notification permission",
    notificationPrimary: "In-page completion panel remains primary.",
    openInterruptionPlaceholder: "Capture an intention, a summary, or the next follow-up task...",
    planned: "Planned",
    recentSessions: "Recent sessions",
    root: "Root",
    reopen: "Reopen",
    restore: "Restore",
    restoreData: "Restore data",
    resume: "Resume",
    save: "Save",
    saveCompleted: "Save completed",
    saveTask: "Save task",
    settings: "Settings",
    state: "State",
    system: "System",
    task: "Task",
    taskTree: "Task tree",
    theme: "Theme",
    today: "Today",
    pause: "Pause",
    finish: "Finish",
    idle: "Idle",
    unknownTask: "Unknown task",
    completedPomodoros: "Completed Pomodoros",
    collapseArchived: "Collapse archived tasks",
    expandArchived: "Expand archived tasks",
    focusCompleteNotification: "Pomotree focus complete",
    focusCompleteBody: "is ready to finish.",
    session: "session",
    toggleTaskHint: "Click chevron to expand/collapse",
    summaryPlaceholder: "What did you actually complete? Summary is optional for MVP.",
    unassigned: "Unassigned / intention",
  },
  zh: {
    add: "添加",
    addInterruption: "添加打断",
    addSubtask: "添加子任务",
    addTaskPlaceholder: "添加任务或路径，例如：项目 / 子任务",
    archive: "归档",
    archivedTasks: "已归档任务",
    actualAttribution: "实际归属",
    browserNotifications: "浏览器通知",
    cancel: "取消",
    clickTaskHint: "点击任务进行选择",
    completed: "已完成",
    convertToTask: "转为任务",
    correctAttribution: "修正归属",
    currentArchivedAttribution: "当前归档归属",
    currentFocus: "当前专注",
    dark: "夜间",
    defaultFocusDuration: "默认专注时长",
    discard: "丢弃",
    dismiss: "忽略",
    done: "完成",
    edit: "编辑",
    exportJson: "导出 JSON",
    focus: "专注",
    focusMinutes: "专注分钟数",
    focusTime: "专注时长",
    finishSession: "完成这次专注",
    headerSubtitle: "专注树，一次推进一个番茄钟",
    importJson: "导入 JSON",
    importPlaceholder: "粘贴 Pomotree 导出的 JSON 对象",
    intentionLabel: "不绑定任务的意图",
    intentionPlaceholder: "例如：阅读并批注方案",
    interruptions: "打断记录",
    language: "语言",
    light: "日间",
    loading: "加载中…",
    localFirst: "本地优先 MVP",
    markAttributedDone: "标记归属任务为完成",
    markDone: "标记完成",
    noArchivedTasks: "暂无归档任务。",
    noCompletedSessions: "还没有已完成的专注记录。",
    noOpenInterruptions: "暂无未处理打断。",
    noTasksYet: "暂无任务。创建你的第一个专注树节点。",
    noTaskSelected: "未选择任务",
    notReady: "未就绪",
    notificationPermission: "通知权限",
    notificationPrimary: "页面内完成面板仍是主要提醒。",
    openInterruptionPlaceholder: "记录一个意图、总结，或下一步要处理的任务...",
    planned: "计划",
    recentSessions: "最近专注",
    root: "根目录",
    reopen: "重新打开",
    restore: "恢复",
    restoreData: "恢复数据",
    resume: "继续",
    save: "保存",
    saveCompleted: "保存为完成",
    saveTask: "保存任务",
    settings: "设置",
    state: "状态",
    system: "跟随系统",
    task: "任务",
    taskTree: "任务树",
    theme: "外观",
    today: "今天",
    pause: "暂停",
    finish: "完成",
    idle: "空闲",
    unknownTask: "未知任务",
    completedPomodoros: "已完成番茄钟",
    collapseArchived: "收起归档任务",
    expandArchived: "展开归档任务",
    focusCompleteNotification: "Pomotree 专注完成",
    focusCompleteBody: "已准备完成。",
    session: "专注记录",
    toggleTaskHint: "点击箭头展开/收起",
    summaryPlaceholder: "你实际完成了什么？MVP 阶段总结可选。",
    unassigned: "未分配 / 仅意图",
  },
};

export default function Home() {
  const {
    settings,
    tasks,
    sessions,
    interruptions,
    hydrate,
    updateSettings,
    createTask,
    createTaskPath,
    updateTask,
    archiveTask,
    restoreTaskBranch,
    changeSessionAttribution,
    moveTask,
    startFocus,
    createInterruption,
    dismissInterruption,
    markInterruptionDone,
    convertInterruptionToTask,
    exportJson,
    importJson,
    pauseSession,
    resumeSession,
    discardSession,
    requestFinish,
    expireRunningSession,
    saveFinish,
    pauses,
    ready,
    loading,
    error,
    recoveryNotice,
  } = useAppStore();
  const [taskTitle, setTaskTitle] = useState("");
  const [focusIntention, setFocusIntention] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState("");
  const [interruptionText, setInterruptionText] = useState("");
  const [summary, setSummary] = useState("");
  const [markTaskDone, setMarkTaskDone] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingParentId, setEditingParentId] = useState("");
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [expandedTaskOverrides, setExpandedTaskOverrides] = useState<Record<string, boolean>>({});
  const [showArchivedTasks, setShowArchivedTasks] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTaskId, setEditingSessionTaskId] = useState("");
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | "unsupported">("unsupported");
  const lastNotifiedSessionIdRef = useRef<string | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const language = settings.language ?? "en";
  const copy = DASHBOARD_TEXT[language];

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
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    window.setTimeout(() => {
      if ("Notification" in window) {
        setNotificationStatus(window.Notification.permission);
      }
    }, 0);
  }, []);

  useEffect(() => {
    const closeOpenMenus = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (!details.contains(target)) {
          details.removeAttribute("open");
        }
      });
    };

    document.addEventListener("pointerdown", closeOpenMenus);
    return () => document.removeEventListener("pointerdown", closeOpenMenus);
  }, []);

  const activeSession = sessions.find((session) => ["running", "paused", "finishing"].includes(session.status));
  const activeTask = activeSession?.taskId ? tasks.find((task) => task.id === activeSession.taskId) : undefined;
  const activeTaskRows = useMemo(() => getActiveTaskRows(tasks), [tasks]);
  const activeTaskChildrenMap = useMemo(() => getTaskChildrenMap(tasks, { includeArchived: false }), [tasks]);
  const archivedBranchRoots = useMemo(() => getArchivedBranchRoots(tasks), [tasks]);
  const activeTaskIdSet = useMemo(() => new Set(tasks.filter((task) => task.status !== "archived" && task.status !== "done").map((task) => task.id)), [tasks]);
  const lastTaskId = useMemo(() => lastActiveSessionTaskId(sessions, activeTaskIdSet), [activeTaskIdSet, sessions]);
  const firstActiveTaskId = activeTaskRows[0]?.task.id ?? null;
  const defaultTaskId = activeSession?.taskId ?? lastTaskId ?? firstActiveTaskId;
  const effectiveTaskId = selectedTaskId === undefined ? defaultTaskId : selectedTaskId;
  const finishTaskId = selectedTaskId === undefined ? undefined : selectedTaskId;
  const activeSessionHasArchivedAttribution = activeTask?.status === "archived";
  const selectedTask = effectiveTaskId ? tasks.find((task) => task.id === effectiveTaskId) : undefined;
  const canMarkSelectedTaskDone = Boolean(selectedTask && selectedTask.status !== "archived");
  const autoExpandedTaskIds = useMemo(
    () => getAutoExpandedTaskIds(tasks, [effectiveTaskId, activeSession?.taskId]),
    [activeSession?.taskId, effectiveTaskId, tasks],
  );
  const effectiveAddingSubtaskParentId = addingSubtaskParentId && activeTaskIdSet.has(addingSubtaskParentId) ? addingSubtaskParentId : null;
  const expandedTaskIds = useMemo(() => {
    const expanded = new Set<string>(autoExpandedTaskIds);

    for (const task of tasks) {
      if (task.status === "archived") continue;

      const hasChildren = (activeTaskChildrenMap.get(task.id)?.length ?? 0) > 0;
      if (!hasChildren) continue;

      const override = activeTaskIdSet.has(task.id) ? expandedTaskOverrides[task.id] : undefined;
      const shouldExpand = override === true || (override !== false && task.parentId === null);
      if (shouldExpand) {
        expanded.add(task.id);
      }
    }

    return expanded;
  }, [activeTaskChildrenMap, activeTaskIdSet, autoExpandedTaskIds, expandedTaskOverrides, tasks]);
  const visibleTaskRows = useMemo(
    () => getTaskRows(tasks, { includeArchived: false, expandedTaskIds, defaultExpandedDepth: -1 }),
    [expandedTaskIds, tasks],
  );

  const activeTaskTitle = activeSession?.intention
    ? activeSession.intention
    : activeSession?.taskPathSnapshot ?? tasks.find((task) => task.id === effectiveTaskId)?.title ?? copy.noTaskSelected;
  const customPlannedSeconds = plannedMinutes.trim() ? Math.max(1, Number(plannedMinutes)) * 60 : undefined;
  const previewPlannedSeconds = customPlannedSeconds ?? settings.defaultFocusSeconds;
  const remainingSeconds = activeSession ? computeRemainingSeconds(activeSession, pauses, now) : previewPlannedSeconds;

  useEffect(() => {
    if (activeSession?.status === "running" && remainingSeconds <= 0) {
      const shouldNotify = settings.enableNotifications && notificationStatus === "granted" && lastNotifiedSessionIdRef.current !== activeSession.id;
      if (shouldNotify) {
        new Notification(copy.focusCompleteNotification, {
          body: `${activeTaskTitle} ${copy.focusCompleteBody}`,
          tag: activeSession.id,
        });
        lastNotifiedSessionIdRef.current = activeSession.id;
      }
      void expireRunningSession(activeSession.id);
    }
  }, [activeSession, activeTaskTitle, copy.focusCompleteBody, copy.focusCompleteNotification, expireRunningSession, notificationStatus, remainingSeconds, settings.enableNotifications]);
  const todayStats = useMemo(() => getTodayStats(sessions, interruptions), [sessions, interruptions]);
  const taskStatsById = useMemo(() => {
    return new Map(tasks.map((task) => [task.id, getTaskStats(tasks, sessions, task.id)]));
  }, [sessions, tasks]);
  const recentSessions = sessions.filter((session) => ["completed", "partial"].includes(session.status)).slice(0, 5);
  const openInterruptions = interruptions.filter((interruption) => interruption.status === "open");
  const canStartFocus = Boolean((effectiveTaskId && selectedTask?.status !== "done" && selectedTask?.status !== "archived") || focusIntention.trim());

  const editableParentOptions = useMemo(() => {
    if (!editingTaskId) return [];
    const excluded = new Set<string>();
    const collect = (taskId: string) => {
      excluded.add(taskId);
      for (const task of tasks) {
        if (task.parentId === taskId) collect(task.id);
      }
    };
    collect(editingTaskId);
    return activeTaskRows.filter(({ task }) => !excluded.has(task.id));
  }, [activeTaskRows, editingTaskId, tasks]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskOverrides((current) => ({
      ...current,
      [taskId]: !expandedTaskIds.has(taskId),
    }));
  };

  const beginEditTask = (task: (typeof tasks)[number]) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingParentId(task.parentId ?? "");
  };

  const saveTaskEdit = async () => {
    if (!editingTaskId) return;
    await updateTask(editingTaskId, { title: editingTaskTitle });
    await moveTask(editingTaskId, editingParentId || null);
    setEditingTaskId(null);
    setEditingTaskTitle("");
    setEditingParentId("");
  };

  const saveInlineSubtask = async () => {
    if (!effectiveAddingSubtaskParentId) return;
    await createTask(subtaskTitle, effectiveAddingSubtaskParentId);
    setExpandedTaskOverrides((current) => ({
      ...current,
      [effectiveAddingSubtaskParentId]: true,
    }));
    setAddingSubtaskParentId(null);
    setSubtaskTitle("");
  };

  const beginEditSession = (session: (typeof sessions)[number]) => {
    setEditingSessionId(session.id);
    setEditingSessionTaskId(session.taskId ?? "");
  };

  const saveInterruptionNote = async () => {
    await createInterruption(interruptionText);
    setInterruptionText("");
  };

  const saveSessionAttribution = async () => {
    if (!editingSessionId) return;
    await changeSessionAttribution(editingSessionId, editingSessionTaskId || null);
    setEditingSessionId(null);
    setEditingSessionTaskId("");
  };

  const toggleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      await updateSettings({ enableNotifications: false });
      return;
    }

    if (!("Notification" in window)) {
      setNotificationStatus("unsupported");
      await updateSettings({ enableNotifications: false });
      return;
    }

    const permission = window.Notification.permission === "default" ? await window.Notification.requestPermission() : window.Notification.permission;
    setNotificationStatus(permission);
    await updateSettings({ enableNotifications: permission === "granted" });
  };

  return (
    <main className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted)] uppercase">Pomotree</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.headerSubtitle}</h1>
          </div>
          <div className="rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)]">
            {loading ? copy.loading : ready ? copy.localFirst : copy.notReady}
          </div>
        </header>

        {error ? <p className="mt-4 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]">{error}</p> : null}
        {recoveryNotice ? (
          <p className="mt-4 rounded-2xl border border-[var(--info-border)] bg-[var(--info-bg)] px-4 py-3 text-sm text-[var(--info-text)]">
            {recoveryNotice.message}
          </p>
        ) : null}

        <section className="grid flex-1 items-start gap-6 py-6 lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.35fr_0.65fr]">
          <div className="grid content-start gap-6">
            <section className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_0_var(--shadow-line)]">
              <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                    <Timer size={14} strokeWidth={2} aria-hidden="true" />
                    {copy.currentFocus}
                  </div>
                  <h2 className="mt-4 text-[4.5rem] font-bold leading-none tracking-[-0.07em] sm:text-[6rem]" aria-label={`${copy.planned} ${formatClock(remainingSeconds)}`}>{formatClock(remainingSeconds)}</h2>
                  <p className="mt-3 max-w-[52ch] truncate text-sm font-medium text-[var(--muted-strong)]">{activeTaskTitle}</p>
                </div>
                <div className="flex flex-wrap justify-start gap-2 md:max-w-[220px] md:justify-end">
                  {!activeSession ? (
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(240,90,50,0.22)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted)] disabled:shadow-none"
                      disabled={!canStartFocus}
                      onClick={() => void startFocus(effectiveTaskId ?? null, focusIntention, customPlannedSeconds).then(() => setFocusIntention(""))}
                    >
                      {copy.focus}
                    </button>
                  ) : activeSession.status === "paused" ? (
                    <button
                      className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(240,90,50,0.22)]"
                      onClick={() => void resumeSession()}
                    >
                      {copy.resume}
                    </button>
                  ) : activeSession.status === "running" ? (
                    <button
                      className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(240,90,50,0.22)]"
                      onClick={() => void pauseSession()}
                    >
                      {copy.pause}
                    </button>
                  ) : null}
                  {activeSession && activeSession.status !== "finishing" ? (
                    <button
                      className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--muted-strong)]"
                      onClick={() => void requestFinish()}
                    >
                      {copy.finish}
                    </button>
                  ) : null}
                  {activeSession ? (
                    <button
                      className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)]"
                      onClick={() => void discardSession()}
                    >
                      {copy.discard}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 border-y border-[var(--border-subtle)] px-6 py-4 sm:grid-cols-3">
                <MetricCard label={copy.task} value={activeTaskTitle} tone="accent" />
                <MetricCard label={copy.state} value={activeSession?.status ?? copy.idle} />
                <MetricCard label={copy.planned} value={`${(activeSession?.plannedSeconds ?? previewPlannedSeconds) / 60} min`} />
              </div>
              <div className="grid gap-4 p-6">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]" htmlFor="task-attribution">
                    {copy.actualAttribution}
                  </label>
                  <select
                    id="task-attribution"
                    value={effectiveTaskId ?? ""}
                    onChange={(event) => setSelectedTaskId(event.target.value || null)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium outline-none"
                  >
                    {activeSessionHasArchivedAttribution && activeSession?.taskId ? (
                      <option value={activeSession.taskId} disabled>
                        {`${copy.currentArchivedAttribution}: ${activeSession.taskPathSnapshot ?? activeTask?.title ?? copy.unknownTask}`}
                      </option>
                    ) : null}
                    <option value="">{copy.unassigned}</option>
                    {activeTaskRows.map(({ task, depth }) => (
                      <option key={task.id} value={task.id}>
                        {`${"— ".repeat(depth)}${task.title}`}
                      </option>
                    ))}
                  </select>
                </div>
                {!activeSession ? (
                  <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]" htmlFor="focus-intention">
                        {copy.intentionLabel}
                      </label>
                      <input
                        id="focus-intention"
                        value={focusIntention}
                        onChange={(event) => setFocusIntention(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium outline-none placeholder:text-[var(--placeholder)]"
                        placeholder={copy.intentionPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]" htmlFor="planned-minutes">
                        {copy.focusMinutes}
                      </label>
                      <input
                        id="planned-minutes"
                        inputMode="numeric"
                        min={1}
                        max={240}
                        type="number"
                        value={plannedMinutes}
                        onChange={(event) => setPlannedMinutes(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium outline-none placeholder:text-[var(--placeholder)]"
                        placeholder={String(settings.defaultFocusSeconds / 60)}
                      />
                    </div>
                  </div>
                ) : null}
                {activeSession?.status === "finishing" ? (
                  <div className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4">
                    <p className="text-sm font-semibold text-[var(--warning-text)]">{copy.finishSession}</p>
                    <textarea
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-[var(--warning-border)] bg-[var(--surface)] p-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
                      placeholder={copy.summaryPlaceholder}
                    />
                    {canMarkSelectedTaskDone ? (
                      <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--warning-text)]">
                        <span>{copy.markAttributedDone}</span>
                        <input
                          type="checkbox"
                          checked={markTaskDone}
                          onChange={(event) => setMarkTaskDone(event.target.checked)}
                          className="h-5 w-5 accent-[var(--primary)]"
                        />
                      </label>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
                        onClick={() => void saveFinish({ status: "completed", summary, taskId: finishTaskId, markTaskDone }).then(() => { setSummary(""); setSelectedTaskId(markTaskDone ? undefined : (finishTaskId === undefined ? activeSession?.taskId ?? null : finishTaskId)); setMarkTaskDone(false); })}
                      >
                        {copy.saveCompleted}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="grid gap-6">
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_0_var(--shadow-line)]">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold tracking-tight">{copy.taskTree}</h3>
                  <button
                    className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                    onClick={() => taskInputRef.current?.focus()}
                  >
                    + {copy.task}
                  </button>
                </div>
                <form
                  className="mt-4 flex gap-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await createTaskPath(taskTitle);
                    setTaskTitle("");
                  }}
                >
                  <input
                    ref={taskInputRef}
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
                    placeholder={copy.addTaskPlaceholder}
                  />
                  <button className="rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-sm">
                    {copy.add}
                  </button>
                </form>
                <div className="mt-5 overflow-visible rounded-2xl border border-[var(--border)]">
                  {visibleTaskRows.length === 0 ? (
                    <EmptyState icon={<Sprout size={20} strokeWidth={1.8} />} title={copy.noTasksYet} action={copy.addTaskPlaceholder} />
                  ) : (
                    <div>
                      {visibleTaskRows.map(({ task, depth, hasChildren }, rowIndex) => {
                        const isSelected = effectiveTaskId === task.id;
                        const isDone = task.status === "done";
                        const isExpanded = hasChildren ? expandedTaskIds.has(task.id) : false;
                        const stats = taskStatsById.get(task.id);

                        return (
                          <div
                            key={task.id}
                            aria-label={`${copy.task}: ${task.title}`}
                            className={`relative px-3 py-2.5 transition-colors hover:bg-[var(--surface-soft)] ${
                              isSelected ? "bg-[var(--surface-soft)]" : "bg-[var(--surface)]"
                            } ${rowIndex === 0 ? "rounded-t-2xl" : "border-t border-[var(--border-subtle)]"} ${
                              rowIndex === visibleTaskRows.length - 1 ? "rounded-b-2xl" : ""
                            }`}
                            style={{ paddingLeft: depth * 22 + 14 }}
                          >
                            {depth > 0 ? (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-0 left-5 top-0 border-l border-dashed border-[var(--border-subtle)]"
                              />
                            ) : null}
                            <div className="flex items-center gap-3">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <div className="relative z-[1] w-5 shrink-0">
                                  {hasChildren ? (
                                    <button
                                      aria-label={isExpanded ? `${copy.toggleTaskHint}: ${task.title}` : `${copy.toggleTaskHint}: ${task.title}`}
                                      className="grid h-6 w-6 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface)]"
                                      onClick={() => toggleTaskExpansion(task.id)}
                                    >
                                      {isExpanded ? <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" /> : <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />}
                                    </button>
                                  ) : isDone ? (
                                    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-[var(--surface)]">
                                      <Check size={13} strokeWidth={3} />
                                    </span>
                                  ) : (
                                    <span aria-hidden="true" className="block h-5 w-5" />
                                  )}
                                </div>
                                <button
                                  aria-label={`${copy.task}: ${task.title}`}
                                  className={`min-w-0 shrink text-left text-sm font-medium tracking-tight ${
                                    isDone ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"
                                  }`}
                                  onClick={() => setSelectedTaskId(task.id)}
                                >
                                  <span className="truncate">{task.title}</span>
                                </button>
                                {isDone ? (
                                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                                    {copy.done}
                                  </span>
                                ) : null}
                                <span className="whitespace-nowrap text-xs text-[var(--muted)]">
                                  <Timer size={13} strokeWidth={1.8} aria-hidden="true" /> {stats?.completedCount ?? 0} · {formatDuration(stats?.totalFocusSeconds ?? 0)}
                                </span>
                              </div>
                              <div className="ml-auto flex shrink-0 items-center gap-2">
                                {!isDone ? (
                                  <button
                                    aria-label={`${copy.focus}: ${task.title}`}
                                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                                    disabled={Boolean(activeSession)}
                                    onClick={() => void startFocus(task.id, focusIntention, customPlannedSeconds).then(() => setFocusIntention(""))}
                                  >
                                    {copy.focus}
                                  </button>
                                ) : null}
                                {!isDone ? (
                                  <button
                                    aria-label={`${copy.addSubtask}: ${task.title}`}
                                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                    onClick={() => {
                                      setExpandedTaskOverrides((current) => ({
                                        ...current,
                                        [task.id]: true,
                                      }));
                                      setAddingSubtaskParentId(task.id);
                                      setSubtaskTitle("");
                                    }}
                                  >
                                    + {copy.addSubtask}
                                  </button>
                                ) : null}
                                <details className="task-row-menu relative z-20">
                                  <summary
                                    aria-label={`${copy.settings}: ${task.title}`}
                                    className="list-none rounded-full border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden"
                                  >
                                    <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
                                  </summary>
                                  <div className="absolute right-0 z-50 mt-2 min-w-36 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                                    <button
                                      type="button"
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                      onClick={(event) => {
                                        (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                        beginEditTask(task);
                                      }}
                                    >
                                      {copy.edit}
                                    </button>
                                    <button
                                      type="button"
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                      onClick={(event) => {
                                        (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                        void updateTask(task.id, { status: isDone ? "todo" : "done" });
                                      }}
                                    >
                                      {isDone ? copy.reopen : copy.done}
                                    </button>
                                    <button
                                      type="button"
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                      onClick={(event) => {
                                        (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                        void archiveTask(task.id);
                                      }}
                                    >
                                      {copy.archive}
                                    </button>
                                  </div>
                                </details>
                              </div>
                            </div>
                            {effectiveAddingSubtaskParentId === task.id ? (
                              <form
                                className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void saveInlineSubtask();
                                }}
                              >
                                <div className="flex gap-2">
                                  <input
                                    aria-label={`${copy.addSubtask}: ${task.title}`}
                                    value={subtaskTitle}
                                    onChange={(event) => setSubtaskTitle(event.target.value)}
                                    className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                                    placeholder={`${copy.addSubtask}: ${task.title}`}
                                  />
                                  <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium whitespace-nowrap text-[var(--primary-foreground)]">
                                    {copy.addSubtask}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium whitespace-nowrap"
                                    onClick={() => {
                                      setAddingSubtaskParentId(null);
                                      setSubtaskTitle("");
                                    }}
                                  >
                                    {copy.cancel}
                                  </button>
                                </div>
                              </form>
                            ) : null}
                            {editingTaskId === task.id ? (
                              <form
                                className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void saveTaskEdit();
                                }}
                              >
                                <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_180px] xl:items-center">
                                  <input
                                    aria-label={`${copy.edit}: ${task.title}`}
                                    value={editingTaskTitle}
                                    onChange={(event) => setEditingTaskTitle(event.target.value)}
                                    className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                                  />
                                  <select
                                    aria-label={`${copy.task}: ${task.title}`}
                                    value={editingParentId}
                                    onChange={(event) => setEditingParentId(event.target.value)}
                                    className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                                  >
                                    <option value="">{copy.root}</option>
                                    {editableParentOptions.map(({ task: optionTask, depth: optionDepth }) => (
                                      <option key={optionTask.id} value={optionTask.id}>
                                        {`${"— ".repeat(optionDepth)}${optionTask.title}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="mt-2 flex flex-wrap justify-end gap-2">
                                  <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium whitespace-nowrap text-[var(--primary-foreground)]">
                                    {copy.saveTask}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium whitespace-nowrap"
                                    onClick={() => setEditingTaskId(null)}
                                  >
                                    {copy.cancel}
                                  </button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1.5"><Timer size={13} strokeWidth={1.8} aria-hidden="true" /> = {copy.completedPomodoros}</span>
                  <span>•</span>
                  <span>{copy.toggleTaskHint}</span>
                  <span>•</span>
                  <span>{copy.clickTaskHint}</span>
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_0_var(--shadow-line)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Archive size={18} strokeWidth={1.8} className="text-[var(--muted)]" aria-hidden="true" />
                    <h3 className="text-lg font-semibold tracking-tight">{copy.archivedTasks}</h3>
                    <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                      {archivedBranchRoots.length}
                    </span>
                  </div>
                  <button
                    aria-label={showArchivedTasks ? copy.collapseArchived : copy.expandArchived}
                    className="rounded-full px-2 py-1 text-base leading-none text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                    onClick={() => setShowArchivedTasks((current) => !current)}
                  >
                    {showArchivedTasks ? <ChevronDown size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />}
                  </button>
                </div>
                {showArchivedTasks ? (
                  archivedBranchRoots.length === 0 ? (
                    <EmptyState icon={<Archive size={20} strokeWidth={1.8} />} title={copy.noArchivedTasks} />
                  ) : (
                    <div className="mt-4 overflow-visible rounded-2xl border border-[var(--border)]">
                      {archivedBranchRoots.map((task, index) => {
                        const stats = taskStatsById.get(task.id);
                        return (
                          <article
                            key={task.id}
                            className={`bg-[var(--surface)] px-3 py-2.5 ${
                              index === 0 ? "rounded-t-2xl" : ""
                            } ${index < archivedBranchRoots.length - 1 ? "border-b border-[var(--border)]" : "rounded-b-2xl"}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Archive size={17} strokeWidth={1.8} className="text-[var(--muted)]" aria-hidden="true" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{task.title}</p>
                                  <p className="mt-1 text-xs text-[var(--muted)]">
                                    <Timer size={13} strokeWidth={1.8} aria-hidden="true" /> {stats?.completedCount ?? 0} · {formatDuration(stats?.totalFocusSeconds ?? 0)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                  onClick={() => void restoreTaskBranch(task.id)}
                                >
                                  {copy.restore}
                                </button>
                                <details className="task-row-menu relative z-20">
                                  <summary
                                    aria-label={`${copy.settings}: ${task.title}`}
                                    className="list-none rounded-full border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden"
                                  >
                                    <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
                                  </summary>
                                  <div className="absolute right-0 z-50 mt-2 min-w-36 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                                    <button
                                      type="button"
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                      onClick={(event) => {
                                        (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                        beginEditTask(task);
                                      }}
                                    >
                                      {copy.edit}
                                    </button>
                                  </div>
                                </details>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </section>

              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h3 className="text-lg font-semibold">{copy.today}</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    [copy.completed, String(todayStats.completedCount)],
                    [copy.focusTime, formatDuration(todayStats.totalFocusSeconds)],
                    [copy.interruptions, String(todayStats.openInterruptionCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-[var(--surface-soft)] p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                      <p className="mt-2 text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{copy.recentSessions}</p>
                  {recentSessions.length === 0 ? (
                    <EmptyState icon={<Timer size={20} strokeWidth={1.8} />} title={copy.noCompletedSessions} action={copy.currentFocus} />
                  ) : (
                    recentSessions.map((session) => (
                      <article
                        key={session.id}
                        aria-label={`${copy.recentSessions}: ${session.taskPathSnapshot ?? session.intention ?? copy.unassigned}`}
                        className="rounded-2xl bg-[var(--surface-soft)] px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{session.taskPathSnapshot ?? session.intention ?? copy.unassigned}</span>
                          <span className="text-xs text-[var(--muted)]">{session.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatDuration(session.actualSeconds)}
                          {session.summary ? ` - ${session.summary}` : ""}
                        </p>
                        {editingSessionId === session.id ? (
                          <form
                            className="mt-3 grid gap-2 rounded-2xl bg-[var(--surface)] p-3 sm:grid-cols-[1fr_auto_auto]"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveSessionAttribution();
                            }}
                          >
                            <select
                              aria-label={`${copy.correctAttribution}: ${session.taskPathSnapshot ?? session.intention ?? copy.session}`}
                              value={editingSessionTaskId}
                              onChange={(event) => setEditingSessionTaskId(event.target.value)}
                              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                            >
                              <option value="">{copy.unassigned}</option>
                              {activeTaskRows.map(({ task, depth }) => (
                                <option key={task.id} value={task.id}>
                                  {`${"— ".repeat(depth)}${task.title}`}
                                </option>
                              ))}
                            </select>
                            <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)]">{copy.save}</button>
                            <button
                              type="button"
                              className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium"
                              onClick={() => {
                                setEditingSessionId(null);
                                setEditingSessionTaskId("");
                              }}
                            >
                              {copy.cancel}
                            </button>
                          </form>
                        ) : (
                          <button
                            className="mt-3 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)]"
                            onClick={() => beginEditSession(session)}
                          >
                            {copy.correctAttribution}
                          </button>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="grid content-start gap-6">
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h3 className="text-lg font-semibold">{copy.interruptions}</h3>
              <textarea
                className="mt-4 min-h-40 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-sm outline-none placeholder:text-[var(--placeholder)]"
                placeholder={copy.openInterruptionPlaceholder}
                value={interruptionText}
                onChange={(event) => setInterruptionText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void saveInterruptionNote();
                  }
                }}
              />
              <div className="mt-4 flex gap-3">
                <button
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium"
                  onClick={() => void saveInterruptionNote()}
                >
                  {copy.addInterruption}
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {openInterruptions.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{copy.noOpenInterruptions}</p>
                ) : (
                  openInterruptions.map((interruption) => (
                    <div key={interruption.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                      <p className="text-sm font-medium text-[var(--muted-strong)]">{interruption.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium"
                          onClick={() => void convertInterruptionToTask(interruption.id)}
                        >
                          {copy.convertToTask}
                        </button>
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium"
                          onClick={() => void markInterruptionDone(interruption.id)}
                        >
                          {copy.markDone}
                        </button>
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium"
                          onClick={() => void dismissInterruption(interruption.id)}
                        >
                          {copy.dismiss}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h3 className="text-lg font-semibold">{copy.settings}</h3>
              <div className="mt-4 space-y-4 text-sm">
                <label className="block rounded-2xl bg-[var(--surface-soft)] px-4 py-3">
                  <span>{copy.defaultFocusDuration}</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium outline-none"
                    value={settings.defaultFocusSeconds}
                    onChange={(event) => void updateSettings({ defaultFocusSeconds: Number(event.target.value) })}
                  >
                    <option value={25 * 60}>25 min</option>
                    <option value={50 * 60}>50 min</option>
                    <option value={90 * 60}>90 min</option>
                  </select>
                </label>

                <label className="block rounded-2xl bg-[var(--surface-soft)] px-4 py-3">
                  <span>{copy.language}</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium outline-none"
                    value={language}
                    onChange={(event) => void updateSettings({ language: event.target.value as AppLanguage })}
                  >
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </select>
                </label>
                <label className="block rounded-2xl bg-[var(--surface-soft)] px-4 py-3">
                  <span>{copy.theme}</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium outline-none"
                    value={settings.theme}
                    onChange={(event) => void updateSettings({ theme: event.target.value as typeof settings.theme })}
                  >
                    <option value="system">{copy.system}</option>
                    <option value="light">{copy.light}</option>
                    <option value="dark">{copy.dark}</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--surface-soft)] px-4 py-3">
                  <span>{copy.browserNotifications}</span>
                  <input
                    type="checkbox"
                    checked={settings.enableNotifications}
                    onChange={(event) => void toggleNotifications(event.target.checked)}
                    className="h-5 w-5 accent-[var(--primary)]"
                  />
                </label>
                <p className="px-1 text-xs text-[var(--muted)]">
                  {copy.notificationPermission}: {notificationStatus}. {copy.notificationPrimary}
                </p>
                <CloudSyncPanel language={language} />
                <button
                  className="w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)]"
                  onClick={async () => {
                    const json = await exportJson();
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `pomotree-export-${new Date().toISOString()}.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {copy.exportJson}
                </button>
                <button
                  className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-medium"
                  onClick={() => setShowImport((value) => !value)}
                >
                  {copy.importJson}
                </button>
                {showImport ? (
                  <form
                    className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await importJson(importText);
                      setImportText("");
                      setShowImport(false);
                    }}
                  >
                    <textarea
                      aria-label={copy.importJson}
                      className="min-h-32 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs outline-none placeholder:text-[var(--placeholder)]"
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder={copy.importPlaceholder}
                    />
                    <div className="flex gap-2">
                      <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)]">{copy.restoreData}</button>
                      <button
                        type="button"
                        className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium"
                        onClick={() => {
                          setImportText("");
                          setShowImport(false);
                        }}
                      >
                        {copy.cancel}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
