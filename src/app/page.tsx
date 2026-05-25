"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    createTaskPath,
    updateTask,
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
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTaskId, setEditingSessionTaskId] = useState("");
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | "unsupported">("unsupported");
  const lastNotifiedSessionIdRef = useRef<string | null>(null);
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


  const activeSession = sessions.find((session) => ["running", "paused", "finishing"].includes(session.status));

  const effectiveTaskId = selectedTaskId === undefined ? activeSession?.taskId ?? tasks[0]?.id ?? null : selectedTaskId;

  const visibleTasks = useMemo(() => {
    const byParent = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const key = task.parentId ?? "root";
      byParent.set(key, [...(byParent.get(key) ?? []), task]);
    }

    const rows: Array<{ task: (typeof tasks)[number]; depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      const key = parentId ?? "root";
      for (const task of byParent.get(key) ?? []) {
        rows.push({ task, depth });
        visit(task.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  }, [tasks]);

  const activeTaskTitle = activeSession?.intention
    ? activeSession.intention
    : tasks.find((task) => task.id === effectiveTaskId)?.title ?? "No task selected";
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
  const canStartFocus = Boolean(effectiveTaskId ?? focusIntention.trim());
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
    return visibleTasks.filter(({ task }) => !excluded.has(task.id) && task.status !== "archived");
  }, [editingTaskId, tasks, visibleTasks]);

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

  const beginEditSession = (session: (typeof sessions)[number]) => {
    setEditingSessionId(session.id);
    setEditingSessionTaskId(session.taskId ?? "");
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
        <header className="flex items-center justify-between border-b border-black/10 pb-5">
          <div>
            <p className="text-sm font-medium tracking-[0.18em] text-black/50 uppercase">Pomotree</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Focus tree, one session at a time</h1>
          </div>
          <div className="rounded-full border border-black/10 px-3 py-1 text-sm text-black/60">
            {loading ? "Loading…" : ready ? "Local-first MVP" : "Not ready"}
          </div>
        </header>

        {error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {recoveryNotice ? (
          <p className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {recoveryNotice.message}
          </p>
        ) : null}

        <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.35fr_0.65fr]">
          <div className="grid gap-6">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-black/50">Current focus</p>
                  <h2 className="mt-1 text-4xl font-semibold tracking-tight" aria-label={`Remaining time ${formatClock(remainingSeconds)}`}>{formatClock(remainingSeconds)}</h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {!activeSession ? (
                    <button
                      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                      disabled={!canStartFocus}
                      onClick={() => void startFocus(effectiveTaskId ?? null, focusIntention, customPlannedSeconds).then(() => setFocusIntention(""))}
                    >
                      Start focus
                    </button>
                  ) : activeSession.status === "paused" ? (
                    <button
                      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                      onClick={() => void resumeSession()}
                    >
                      Resume
                    </button>
                  ) : activeSession.status === "running" ? (
                    <button
                      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                      onClick={() => void pauseSession()}
                    >
                      Pause
                    </button>
                  ) : null}
                  {activeSession && activeSession.status !== "finishing" ? (
                    <button
                      className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/65"
                      onClick={() => void requestFinish()}
                    >
                      Finish
                    </button>
                  ) : null}
                  {activeSession ? (
                    <button
                      className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/65"
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
                  <div key={label} className="rounded-2xl bg-black/[0.03] p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-black/45">{label}</p>
                    <p className="mt-2 text-sm font-medium text-black/80">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium uppercase tracking-[0.16em] text-black/45" htmlFor="task-attribution">
                  Actual attribution
                </label>
                <select
                  id="task-attribution"
                  value={effectiveTaskId ?? ""}
                  onChange={(event) => setSelectedTaskId(event.target.value || null)}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none"
                >
                  <option value="">Unassigned / intention</option>
                  {visibleTasks.map(({ task, depth }) => (
                    <option key={task.id} value={task.id}>
                      {`${"— ".repeat(depth)}${task.title}`}
                    </option>
                  ))}
                </select>
              </div>
              {!activeSession ? (
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_160px]">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-black/45" htmlFor="focus-intention">
                      Intention without a task
                    </label>
                    <input
                      id="focus-intention"
                      value={focusIntention}
                      onChange={(event) => setFocusIntention(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none placeholder:text-black/30"
                      placeholder="e.g. Read and annotate the proposal"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-black/45" htmlFor="planned-minutes">
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
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none placeholder:text-black/30"
                      placeholder={String(settings.defaultFocusSeconds / 60)}
                    />
                  </div>
                </div>
              ) : null}
              {activeSession?.status === "finishing" ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">Finish this focus session</p>
                  <textarea
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-amber-200 bg-white p-3 text-sm outline-none placeholder:text-black/30"
                    placeholder="What did you actually complete? Summary is optional for MVP."
                  />
                  {effectiveTaskId ? (
                    <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-white px-3 py-2 text-sm text-amber-950">
                      <span>Mark attributed task done</span>
                      <input
                        type="checkbox"
                        checked={markTaskDone}
                        onChange={(event) => setMarkTaskDone(event.target.checked)}
                        className="h-5 w-5 accent-black"
                      />
                    </label>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                      onClick={() => void saveFinish({ status: "completed", summary, taskId: effectiveTaskId, markTaskDone }).then(() => { setSummary(""); setSelectedTaskId(undefined); setMarkTaskDone(false); })}
                    >
                      Save completed
                    </button>
                    <button
                      className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium"
                      onClick={() => void saveFinish({ status: "partial", summary, taskId: effectiveTaskId, markTaskDone }).then(() => { setSummary(""); setSelectedTaskId(undefined); setMarkTaskDone(false); })}
                    >
                      Save partial
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-3xl border border-black/10 bg-white p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Task tree</h3>
                  <button className="text-sm font-medium text-black/55">+ Task</button>
                </div>
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await createTaskPath(taskTitle);
                    setTaskTitle("");
                  }}
                >
                  <input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    className="w-full rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-3 text-sm outline-none placeholder:text-black/30"
                    placeholder="Add a task or path, e.g. Project / Subtask"
                  />
                  <button className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white">Add</button>
                </form>
                <div className="mt-5 space-y-3 text-sm">
                  {tasks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-6 text-black/45">
                      No tasks yet. Create your first focus tree node.
                    </div>
                  ) : (
                    visibleTasks.map(({ task, depth }) => (
                      <div key={task.id} className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3" style={{ marginLeft: depth * 16 }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="font-medium">{depth > 0 ? "↳ " : ""}{task.title}</span>
                            <p className="mt-1 text-xs text-black/45">
                              {taskStatsById.get(task.id)?.completedCount ?? 0} done - {formatDuration(taskStatsById.get(task.id)?.totalFocusSeconds ?? 0)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              aria-label={`Focus ${task.title}`}
                              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/55 disabled:opacity-40"
                              disabled={Boolean(activeSession)}
                              onClick={() => void startFocus(task.id, focusIntention, customPlannedSeconds).then(() => setFocusIntention(""))}
                            >
                              Focus
                            </button>
                            <button
                              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/55"
                              onClick={() => void updateTask(task.id, { status: task.status === "done" ? "todo" : "done" })}
                            >
                              {task.status === "done" ? "Reopen" : "Done"}
                            </button>
                            <button
                              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/55"
                              onClick={() => beginEditTask(task)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/55"
                              onClick={() => void updateTask(task.id, { status: "archived" })}
                            >
                              Archive
                            </button>
                          </div>
                        </div>
                        {editingTaskId === task.id ? (
                          <form
                            className="mt-3 grid gap-2 rounded-2xl bg-white p-3 md:grid-cols-[1fr_180px_auto_auto]"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveTaskEdit();
                            }}
                          >
                            <input
                              aria-label={`Edit title for ${task.title}`}
                              value={editingTaskTitle}
                              onChange={(event) => setEditingTaskTitle(event.target.value)}
                              className="rounded-xl border border-black/10 px-3 py-2 outline-none"
                            />
                            <select
                              aria-label={`Move ${task.title}`}
                              value={editingParentId}
                              onChange={(event) => setEditingParentId(event.target.value)}
                              className="rounded-xl border border-black/10 px-3 py-2 outline-none"
                            >
                              <option value="">Root</option>
                              {editableParentOptions.map(({ task: optionTask, depth: optionDepth }) => (
                                <option key={optionTask.id} value={optionTask.id}>
                                  {`${"— ".repeat(optionDepth)}${optionTask.title}`}
                                </option>
                              ))}
                            </select>
                            <button className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white">Save task</button>
                            <button
                              type="button"
                              className="rounded-xl border border-black/10 px-3 py-2 text-xs font-medium"
                              onClick={() => setEditingTaskId(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-6">
                <h3 className="text-lg font-semibold">Today</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Completed", String(todayStats.completedCount)],
                    ["Partial", String(todayStats.partialCount)],
                    ["Focus time", formatDuration(todayStats.totalFocusSeconds)],
                    ["Interruptions", String(todayStats.openInterruptionCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-black/[0.03] p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-black/45">{label}</p>
                      <p className="mt-2 text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-black/45">Recent sessions</p>
                  {recentSessions.length === 0 ? (
                    <p className="rounded-2xl bg-black/[0.03] px-4 py-3 text-sm text-black/45">No completed focus sessions yet.</p>
                  ) : (
                    recentSessions.map((session) => (
                      <article
                        key={session.id}
                        aria-label={`Recent session: ${session.taskPathSnapshot ?? session.intention ?? "Unassigned"}`}
                        className="rounded-2xl bg-black/[0.03] px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{session.taskPathSnapshot ?? session.intention ?? "Unassigned"}</span>
                          <span className="text-xs text-black/45">{session.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-black/45">
                          {formatDuration(session.actualSeconds)}
                          {session.summary ? ` - ${session.summary}` : ""}
                        </p>
                        {editingSessionId === session.id ? (
                          <form
                            className="mt-3 grid gap-2 rounded-2xl bg-white p-3 sm:grid-cols-[1fr_auto_auto]"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveSessionAttribution();
                            }}
                          >
                            <select
                              aria-label={`Correct attribution for ${session.taskPathSnapshot ?? session.intention ?? "session"}`}
                              value={editingSessionTaskId}
                              onChange={(event) => setEditingSessionTaskId(event.target.value)}
                              className="rounded-xl border border-black/10 px-3 py-2 outline-none"
                            >
                              <option value="">Unassigned / intention</option>
                              {visibleTasks.map(({ task, depth }) => (
                                <option key={task.id} value={task.id}>
                                  {`${"— ".repeat(depth)}${task.title}`}
                                </option>
                              ))}
                            </select>
                            <button className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white">Save</button>
                            <button
                              type="button"
                              className="rounded-xl border border-black/10 px-3 py-2 text-xs font-medium"
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
                            className="mt-3 rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/55"
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
            </section>
          </div>

          <aside className="grid gap-6">
            <section className="rounded-3xl border border-black/10 bg-white p-6">
              <h3 className="text-lg font-semibold">Session notes</h3>
              <textarea
                className="mt-4 min-h-40 w-full resize-none rounded-2xl border border-black/10 bg-black/[0.02] p-4 text-sm outline-none placeholder:text-black/30"
                placeholder="Capture an intention, a summary, or the next follow-up task..."
                value={interruptionText}
                onChange={(event) => setInterruptionText(event.target.value)}
              />
              <div className="mt-4 flex gap-3">
                <button
                  className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium"
                  onClick={() => void createInterruption(interruptionText).then(() => setInterruptionText(""))}
                >
                  Save note
                </button>
                <button className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium">Add interruption</button>
              </div>
              <div className="mt-5 space-y-3">
                {openInterruptions.length === 0 ? (
                  <p className="text-sm text-black/45">No open interruptions.</p>
                ) : (
                  openInterruptions.map((interruption) => (
                    <div key={interruption.id} className="rounded-2xl border border-black/10 bg-black/[0.02] p-3">
                      <p className="text-sm font-medium text-black/75">{interruption.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium"
                          onClick={() => void convertInterruptionToTask(interruption.id)}
                        >
                          Convert to task
                        </button>
                        <button
                          className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium"
                          onClick={() => void markInterruptionDone(interruption.id)}
                        >
                          Mark done
                        </button>
                        <button
                          className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium"
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

            <section className="rounded-3xl border border-black/10 bg-white p-6">
              <h3 className="text-lg font-semibold">Settings</h3>
              <div className="mt-4 space-y-4 text-sm">
                <label className="block rounded-2xl bg-black/[0.03] px-4 py-3">
                  <span>Default focus duration</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-medium outline-none"
                    value={settings.defaultFocusSeconds}
                    onChange={(event) => void updateSettings({ defaultFocusSeconds: Number(event.target.value) })}
                  >
                    <option value={25 * 60}>25 min</option>
                    <option value={50 * 60}>50 min</option>
                    <option value={90 * 60}>90 min</option>
                  </select>
                </label>
                <label className="block rounded-2xl bg-black/[0.03] px-4 py-3">
                  <span>Theme</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-medium outline-none"
                    value={settings.theme}
                    onChange={(event) => void updateSettings({ theme: event.target.value as typeof settings.theme })}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-black/[0.03] px-4 py-3">
                  <span>Browser notifications</span>
                  <input
                    type="checkbox"
                    checked={settings.enableNotifications}
                    onChange={(event) => void toggleNotifications(event.target.checked)}
                    className="h-5 w-5 accent-black"
                  />
                </label>
                <p className="px-1 text-xs text-black/45">
                  Notification permission: {notificationStatus}. In-page completion panel remains primary.
                </p>
                <button
                  className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
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
                  className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm font-medium"
                  onClick={() => setShowImport((value) => !value)}
                >
                  Import JSON
                </button>
                {showImport ? (
                  <form
                    className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] p-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await importJson(importText);
                      setImportText("");
                      setShowImport(false);
                    }}
                  >
                    <textarea
                      aria-label="Pomotree import JSON"
                      className="min-h-32 w-full resize-none rounded-xl border border-black/10 bg-white p-3 text-xs outline-none placeholder:text-black/30"
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder="Paste a Pomotree export JSON object"
                    />
                    <div className="flex gap-2">
                      <button className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white">Restore data</button>
                      <button
                        type="button"
                        className="rounded-xl border border-black/10 px-3 py-2 text-xs font-medium"
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
