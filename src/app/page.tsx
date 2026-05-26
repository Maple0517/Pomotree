"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveTaskRows, getArchivedBranchRoots, getAutoExpandedTaskIds, getTaskChildrenMap, getTaskRows } from "@/lib/services/taskSelectors";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeRemainingSeconds, formatClock } from "@/lib/utils/timer";
import { formatDuration, getTaskStats, getTodayStats } from "@/lib/services/stats";

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
    const resolvedTheme = settings.theme === "system" ? (prefersDark ? "dark" : "light") : settings.theme;
    root.dataset.theme = resolvedTheme;
  }, [settings.theme]);

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
  const firstActiveTaskId = activeTaskRows[0]?.task.id ?? null;
  const defaultTaskId = activeSession?.taskId ?? firstActiveTaskId;
  const effectiveTaskId = selectedTaskId === undefined ? defaultTaskId : selectedTaskId;
  const finishTaskId = selectedTaskId === undefined ? undefined : selectedTaskId;
  const activeSessionHasArchivedAttribution = activeTask?.status === "archived";
  const selectedTask = effectiveTaskId ? tasks.find((task) => task.id === effectiveTaskId) : undefined;
  const canMarkSelectedTaskDone = Boolean(selectedTask && selectedTask.status !== "archived");
  const autoExpandedTaskIds = useMemo(
    () => getAutoExpandedTaskIds(tasks, [effectiveTaskId, activeSession?.taskId]),
    [activeSession?.taskId, effectiveTaskId, tasks],
  );
  const activeTaskIdSet = useMemo(() => new Set(tasks.filter((task) => task.status !== "archived").map((task) => task.id)), [tasks]);
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
    : activeSession?.taskPathSnapshot ?? tasks.find((task) => task.id === effectiveTaskId)?.title ?? "No task selected";
  const customPlannedSeconds = plannedMinutes.trim() ? Math.max(1, Number(plannedMinutes)) * 60 : undefined;
  const previewPlannedSeconds = customPlannedSeconds ?? settings.defaultFocusSeconds;
  const remainingSeconds = activeSession ? computeRemainingSeconds(activeSession, pauses, now) : previewPlannedSeconds;

  useEffect(() => {
    if (activeSession?.status === "running" && remainingSeconds <= 0) {
      const shouldNotify = settings.enableNotifications && notificationStatus === "granted" && lastNotifiedSessionIdRef.current !== activeSession.id;
      if (shouldNotify) {
        new Notification("Pomotree focus complete", {
          body: `${activeTaskTitle} is ready to finish.`,
          tag: activeSession.id,
        });
        lastNotifiedSessionIdRef.current = activeSession.id;
      }
      void expireRunningSession(activeSession.id);
    }
  }, [activeSession, activeTaskTitle, expireRunningSession, notificationStatus, remainingSeconds, settings.enableNotifications]);
  const todayStats = useMemo(() => getTodayStats(sessions, interruptions), [sessions, interruptions]);
  const taskStatsById = useMemo(() => {
    return new Map(tasks.map((task) => [task.id, getTaskStats(tasks, sessions, task.id)]));
  }, [sessions, tasks]);
  const recentSessions = sessions.filter((session) => ["completed", "partial"].includes(session.status)).slice(0, 5);
  const openInterruptions = interruptions.filter((interruption) => interruption.status === "open");
  const canStartFocus = Boolean((effectiveTaskId && selectedTask?.status !== "done") || focusIntention.trim());

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
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted)] uppercase">Pomotree</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Focus tree, one session at a time</h1>
          </div>
          <div className="rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)]">
            {loading ? "Loading…" : ready ? "Local-first MVP" : "Not ready"}
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
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_0_var(--shadow-line)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--muted)]">Current focus</p>
                  <h2 className="mt-1 text-4xl font-semibold tracking-tight" aria-label={`Remaining time ${formatClock(remainingSeconds)}`}>{formatClock(remainingSeconds)}</h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {!activeSession ? (
                    <button
                      className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
                      disabled={!canStartFocus}
                      onClick={() => void startFocus(effectiveTaskId ?? null, focusIntention, customPlannedSeconds).then(() => setFocusIntention(""))}
                    >
                      Start focus
                    </button>
                  ) : activeSession.status === "paused" ? (
                    <button
                      className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
                      onClick={() => void resumeSession()}
                    >
                      Resume
                    </button>
                  ) : activeSession.status === "running" ? (
                    <button
                      className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
                      onClick={() => void pauseSession()}
                    >
                      Pause
                    </button>
                  ) : null}
                  {activeSession && activeSession.status !== "finishing" ? (
                    <button
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
                      onClick={() => void requestFinish()}
                    >
                      Finish
                    </button>
                  ) : null}
                  {activeSession ? (
                    <button
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
                      onClick={() => void discardSession()}
                    >
                      Discard
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Task", activeTaskTitle],
                  ["State", activeSession?.status ?? "Idle"],
                  ["Planned", `${(activeSession?.plannedSeconds ?? previewPlannedSeconds) / 60} min`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[var(--surface-soft)] p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                    <p className="mt-2 text-sm font-medium text-[var(--muted-strong)]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]" htmlFor="task-attribution">
                  Actual attribution
                </label>
                <select
                  id="task-attribution"
                  value={effectiveTaskId ?? ""}
                  onChange={(event) => setSelectedTaskId(event.target.value || null)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                >
                  {activeSessionHasArchivedAttribution && activeSession?.taskId ? (
                    <option value={activeSession.taskId} disabled>
                      {`Current archived attribution: ${activeSession.taskPathSnapshot ?? activeTask?.title ?? "Unknown task"}`}
                    </option>
                  ) : null}
                  <option value="">Unassigned / intention</option>
                  {activeTaskRows.map(({ task, depth }) => (
                    <option key={task.id} value={task.id}>
                      {`${"— ".repeat(depth)}${task.title}`}
                    </option>
                  ))}
                </select>
              </div>
              {!activeSession ? (
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_160px]">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]" htmlFor="focus-intention">
                      Intention without a task
                    </label>
                    <input
                      id="focus-intention"
                      value={focusIntention}
                      onChange={(event) => setFocusIntention(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
                      placeholder="e.g. Read and annotate the proposal"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]" htmlFor="planned-minutes">
                      Focus minutes
                    </label>
                    <input
                      id="planned-minutes"
                      inputMode="numeric"
                      min={1}
                      max={240}
                      type="number"
                      value={plannedMinutes}
                      onChange={(event) => setPlannedMinutes(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
                      placeholder={String(settings.defaultFocusSeconds / 60)}
                    />
                  </div>
                </div>
              ) : null}
              {activeSession?.status === "finishing" ? (
                <div className="mt-5 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4">
                  <p className="text-sm font-semibold text-[var(--warning-text)]">Finish this focus session</p>
                  <textarea
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-[var(--warning-border)] bg-[var(--surface)] p-3 text-sm outline-none placeholder:text-[var(--placeholder)]"
                    placeholder="What did you actually complete? Summary is optional for MVP."
                  />
                  {canMarkSelectedTaskDone ? (
                    <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--warning-text)]">
                      <span>Mark attributed task done</span>
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
                      onClick={() => void saveFinish({ status: "completed", summary, taskId: finishTaskId, markTaskDone }).then(() => { setSummary(""); setSelectedTaskId(undefined); setMarkTaskDone(false); })}
                    >
                      Save completed
                    </button>
                    <button
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium"
                      onClick={() => void saveFinish({ status: "partial", summary, taskId: finishTaskId, markTaskDone }).then(() => { setSummary(""); setSelectedTaskId(undefined); setMarkTaskDone(false); })}
                    >
                      Save partial
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <div className="grid gap-6">
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_0_var(--shadow-line)]">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold tracking-tight">Task tree</h3>
                  <button
                    className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                    onClick={() => taskInputRef.current?.focus()}
                  >
                    + Task
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
                    placeholder="Add a task or path, e.g. Project / Subtask"
                  />
                  <button className="rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-sm">
                    Add
                  </button>
                </form>
                <div className="mt-5 overflow-visible rounded-2xl border border-[var(--border)]">
                  {visibleTaskRows.length === 0 ? (
                    <div className="bg-[var(--surface-soft)] px-4 py-6 text-sm text-[var(--muted)]">
                      No tasks yet. Create your first focus tree node.
                    </div>
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
                            aria-label={`Task row ${task.title}`}
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
                                      aria-label={isExpanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
                                      className="rounded-md px-1 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
                                      onClick={() => toggleTaskExpansion(task.id)}
                                    >
                                      {isExpanded ? "▾" : "▸"}
                                    </button>
                                  ) : isDone ? (
                                    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--muted)] text-[10px] text-[var(--surface)]">
                                      ✓
                                    </span>
                                  ) : (
                                    <span aria-hidden="true" className="block h-5 w-5" />
                                  )}
                                </div>
                                <button
                                  aria-label={`Select ${task.title}`}
                                  className={`min-w-0 shrink text-left text-sm font-medium tracking-tight ${
                                    isDone ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"
                                  }`}
                                  onClick={() => setSelectedTaskId(task.id)}
                                >
                                  <span className="truncate">{task.title}</span>
                                </button>
                                {isDone ? (
                                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                                    Done
                                  </span>
                                ) : null}
                                <span className="whitespace-nowrap text-xs text-[var(--muted)]">
                                  {stats?.completedCount ?? 0} 🍅 · {formatDuration(stats?.totalFocusSeconds ?? 0)}
                                </span>
                              </div>
                              <div className="ml-auto flex shrink-0 items-center gap-2">
                                {!isDone ? (
                                  <button
                                    aria-label={`Focus ${task.title}`}
                                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                                    disabled={Boolean(activeSession)}
                                    onClick={() => void startFocus(task.id, focusIntention, customPlannedSeconds).then(() => setFocusIntention(""))}
                                  >
                                    Focus
                                  </button>
                                ) : null}
                                {!isDone ? (
                                  <button
                                    aria-label={`Add subtask under ${task.title}`}
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
                                    + Subtask
                                  </button>
                                ) : null}
                                <details className="task-row-menu relative z-20">
                                  <summary
                                    aria-label={`More actions for ${task.title}`}
                                    className="list-none rounded-full border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden"
                                  >
                                    ...
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
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                      onClick={(event) => {
                                        (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                        void updateTask(task.id, { status: isDone ? "todo" : "done" });
                                      }}
                                    >
                                      {isDone ? "Reopen" : "Done"}
                                    </button>
                                    <button
                                      type="button"
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                      onClick={(event) => {
                                        (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                        void archiveTask(task.id);
                                      }}
                                    >
                                      Archive
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
                                    aria-label={`Subtask title under ${task.title}`}
                                    value={subtaskTitle}
                                    onChange={(event) => setSubtaskTitle(event.target.value)}
                                    className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                                    placeholder={`Add a subtask under ${task.title}`}
                                  />
                                  <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium whitespace-nowrap text-[var(--primary-foreground)]">
                                    Add subtask
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium whitespace-nowrap"
                                    onClick={() => {
                                      setAddingSubtaskParentId(null);
                                      setSubtaskTitle("");
                                    }}
                                  >
                                    Cancel
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
                                    aria-label={`Edit title for ${task.title}`}
                                    value={editingTaskTitle}
                                    onChange={(event) => setEditingTaskTitle(event.target.value)}
                                    className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                                  />
                                  <select
                                    aria-label={`Move ${task.title}`}
                                    value={editingParentId}
                                    onChange={(event) => setEditingParentId(event.target.value)}
                                    className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                                  >
                                    <option value="">Root</option>
                                    {editableParentOptions.map(({ task: optionTask, depth: optionDepth }) => (
                                      <option key={optionTask.id} value={optionTask.id}>
                                        {`${"— ".repeat(optionDepth)}${optionTask.title}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="mt-2 flex flex-wrap justify-end gap-2">
                                  <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium whitespace-nowrap text-[var(--primary-foreground)]">
                                    Save task
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium whitespace-nowrap"
                                    onClick={() => setEditingTaskId(null)}
                                  >
                                    Cancel
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
                  <span>🍅 = Completed Pomodoros</span>
                  <span>•</span>
                  <span>Click chevron to expand/collapse</span>
                  <span>•</span>
                  <span>Click task to select</span>
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_0_var(--shadow-line)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="text-base">📦</span>
                    <h3 className="text-lg font-semibold tracking-tight">Archived Tasks</h3>
                    <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                      {archivedBranchRoots.length}
                    </span>
                  </div>
                  <button
                    aria-label={showArchivedTasks ? "Collapse archived tasks" : "Expand archived tasks"}
                    className="rounded-full px-2 py-1 text-base leading-none text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                    onClick={() => setShowArchivedTasks((current) => !current)}
                  >
                    {showArchivedTasks ? "⌄" : "⌃"}
                  </button>
                </div>
                {showArchivedTasks ? (
                  archivedBranchRoots.length === 0 ? (
                    <p className="mt-4 rounded-2xl bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--muted)]">No archived tasks.</p>
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
                                <span aria-hidden="true" className="text-base text-[var(--muted)]">📦</span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{task.title}</p>
                                  <p className="mt-1 text-xs text-[var(--muted)]">
                                    {stats?.completedCount ?? 0} 🍅 · {formatDuration(stats?.totalFocusSeconds ?? 0)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                                  onClick={() => void restoreTaskBranch(task.id)}
                                >
                                  Restore
                                </button>
                                <details className="task-row-menu relative z-20">
                                  <summary
                                    aria-label={`More actions for archived ${task.title}`}
                                    className="list-none rounded-full border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden"
                                  >
                                    ...
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
                                      Edit
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
                <h3 className="text-lg font-semibold">Today</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Completed", String(todayStats.completedCount)],
                    ["Partial", String(todayStats.partialCount)],
                    ["Focus time", formatDuration(todayStats.totalFocusSeconds)],
                    ["Interruptions", String(todayStats.openInterruptionCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-[var(--surface-soft)] p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
                      <p className="mt-2 text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Recent sessions</p>
                  {recentSessions.length === 0 ? (
                    <p className="rounded-2xl bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--muted)]">No completed focus sessions yet.</p>
                  ) : (
                    recentSessions.map((session) => (
                      <article
                        key={session.id}
                        aria-label={`Recent session: ${session.taskPathSnapshot ?? session.intention ?? "Unassigned"}`}
                        className="rounded-2xl bg-[var(--surface-soft)] px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{session.taskPathSnapshot ?? session.intention ?? "Unassigned"}</span>
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
                              aria-label={`Correct attribution for ${session.taskPathSnapshot ?? session.intention ?? "session"}`}
                              value={editingSessionTaskId}
                              onChange={(event) => setEditingSessionTaskId(event.target.value)}
                              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
                            >
                              <option value="">Unassigned / intention</option>
                              {activeTaskRows.map(({ task, depth }) => (
                                <option key={task.id} value={task.id}>
                                  {`${"— ".repeat(depth)}${task.title}`}
                                </option>
                              ))}
                            </select>
                            <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)]">Save</button>
                            <button
                              type="button"
                              className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium"
                              onClick={() => {
                                setEditingSessionId(null);
                                setEditingSessionTaskId("");
                              }}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button
                            className="mt-3 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)]"
                            onClick={() => beginEditSession(session)}
                          >
                            Correct attribution
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
              <h3 className="text-lg font-semibold">Interruptions</h3>
              <textarea
                className="mt-4 min-h-40 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-sm outline-none placeholder:text-[var(--placeholder)]"
                placeholder="Capture an intention, a summary, or the next follow-up task..."
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
                  Add interruption
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {openInterruptions.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No open interruptions.</p>
                ) : (
                  openInterruptions.map((interruption) => (
                    <div key={interruption.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                      <p className="text-sm font-medium text-[var(--muted-strong)]">{interruption.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium"
                          onClick={() => void convertInterruptionToTask(interruption.id)}
                        >
                          Convert to task
                        </button>
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium"
                          onClick={() => void markInterruptionDone(interruption.id)}
                        >
                          Mark done
                        </button>
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium"
                          onClick={() => void dismissInterruption(interruption.id)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h3 className="text-lg font-semibold">Settings</h3>
              <div className="mt-4 space-y-4 text-sm">
                <label className="block rounded-2xl bg-[var(--surface-soft)] px-4 py-3">
                  <span>Default focus duration</span>
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
                  <span>Theme</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium outline-none"
                    value={settings.theme}
                    onChange={(event) => void updateSettings({ theme: event.target.value as typeof settings.theme })}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--surface-soft)] px-4 py-3">
                  <span>Browser notifications</span>
                  <input
                    type="checkbox"
                    checked={settings.enableNotifications}
                    onChange={(event) => void toggleNotifications(event.target.checked)}
                    className="h-5 w-5 accent-[var(--primary)]"
                  />
                </label>
                <p className="px-1 text-xs text-[var(--muted)]">
                  Notification permission: {notificationStatus}. In-page completion panel remains primary.
                </p>
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
                  Export JSON
                </button>
                <button
                  className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-medium"
                  onClick={() => setShowImport((value) => !value)}
                >
                  Import JSON
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
                      aria-label="Pomotree import JSON"
                      className="min-h-32 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs outline-none placeholder:text-[var(--placeholder)]"
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder="Paste a Pomotree export JSON object"
                    />
                    <div className="flex gap-2">
                      <button className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)]">Restore data</button>
                      <button
                        type="button"
                        className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium"
                        onClick={() => {
                          setImportText("");
                          setShowImport(false);
                        }}
                      >
                        Cancel
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
