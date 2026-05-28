import { db, ensureDefaultSettings } from "@/lib/db";
import { createDefaultSettings } from "@/lib/db/defaults";
import { isArchivedBranchRoot } from "@/lib/services/taskSelectors";
import { createId, nowIso } from "@/lib/utils/time";
import {
  validateFocusSessionRecord,
  validateInterruptionRecord,
  validateTaskRecord,
  validateTimerPauseRecord,
  validateUserSettingsRecord,
} from "@/lib/validation/domain";
import type { FocusSession, Interruption, RestorableTaskStatus, Task, TimerPause, UserSettings } from "@/types/domain";

export interface PomotreeExport {
  schemaVersion: 1;
  exportedAt: string;
  tasks: Task[];
  focusSessions: FocusSession[];
  timerPauses: TimerPause[];
  interruptions: Interruption[];
  userSettings: UserSettings;
}

type UnknownRecord = Record<string, unknown>;

export interface RecoveryNotice {
  kind: "expired" | "corrupt";
  message: string;
}

export interface AppSnapshot {
  settings: UserSettings;
  tasks: Task[];
  sessions: FocusSession[];
  interruptions: Interruption[];
  pauses: TimerPause[];
  recoveryNotice: RecoveryNotice | null;
}

export type SettingsUpdate = Partial<
  Pick<
    UserSettings,
    | "defaultFocusSeconds"
    | "defaultBreakSeconds"
    | "enableNotifications"
    | "theme"
    | "language"
    | "autoStartBreak"
    | "autoStartNextFocus"
  >
>;

function isActiveStatus(status: FocusSession["status"]) {
  return status === "running" || status === "paused" || status === "finishing";
}

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePomotreeExport(input: string | unknown): PomotreeExport {
  const parsed: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (!isObject(parsed)) throw new Error("Import file must be a Pomotree JSON object");
  if (parsed.schemaVersion !== 1) throw new Error("Unsupported Pomotree export schema version");
  if (!Array.isArray(parsed.tasks)) throw new Error("Import file is missing tasks");
  if (!Array.isArray(parsed.focusSessions)) throw new Error("Import file is missing focusSessions");
  if (!Array.isArray(parsed.timerPauses)) throw new Error("Import file is missing timerPauses");
  if (!Array.isArray(parsed.interruptions)) throw new Error("Import file is missing interruptions");
  if (!isObject(parsed.userSettings)) throw new Error("Import file is missing userSettings");

  const exportData: PomotreeExport = {
    schemaVersion: 1,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : nowIso(),
    tasks: parsed.tasks as Task[],
    focusSessions: parsed.focusSessions as FocusSession[],
    timerPauses: parsed.timerPauses as TimerPause[],
    interruptions: parsed.interruptions as Interruption[],
    userSettings: parsed.userSettings as unknown as UserSettings,
  };

  validatePomotreeExport(exportData);
  return exportData;
}

function validatePomotreeExport(exportData: PomotreeExport) {
  for (const task of exportData.tasks) validateTaskRecord(task);
  for (const session of exportData.focusSessions) validateFocusSessionRecord(session);
  for (const pause of exportData.timerPauses) validateTimerPauseRecord(pause);
  for (const interruption of exportData.interruptions) validateInterruptionRecord(interruption);
  validateUserSettingsRecord(exportData.userSettings);

  const taskIds = new Set(exportData.tasks.map((task) => task.id));
  if (taskIds.size !== exportData.tasks.length) throw new Error("Import file contains duplicate task ids");
  for (const task of exportData.tasks) {
    if (task.parentId && !taskIds.has(task.parentId)) throw new Error("Import file contains a task with a missing parent");
  }

  const sessionIds = new Set(exportData.focusSessions.map((session) => session.id));
  if (sessionIds.size !== exportData.focusSessions.length) throw new Error("Import file contains duplicate session ids");
  for (const session of exportData.focusSessions) {
    if (session.taskId && !taskIds.has(session.taskId)) throw new Error("Import file contains a session with a missing task");
    if (session.originalTaskId && !taskIds.has(session.originalTaskId)) throw new Error("Import file contains a session with a missing original task");
  }

  const activeCount = exportData.focusSessions.filter((session) => isActiveStatus(session.status)).length;
  if (activeCount > 1) throw new Error("Import file contains multiple active sessions");

  for (const pause of exportData.timerPauses) {
    if (!sessionIds.has(pause.sessionId)) throw new Error("Import file contains a pause with a missing session");
  }
  for (const interruption of exportData.interruptions) {
    if (interruption.sessionId && !sessionIds.has(interruption.sessionId)) throw new Error("Import file contains an interruption with a missing session");
    if (interruption.taskId && !taskIds.has(interruption.taskId)) throw new Error("Import file contains an interruption with a missing task");
    if (interruption.convertedToTaskId && !taskIds.has(interruption.convertedToTaskId)) {
      throw new Error("Import file contains an interruption with a missing converted task");
    }
  }
}

async function computeTaskPath(taskId: string | null) {
  if (!taskId) return null;

  const tasks = await db.tasks.toArray();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(taskId);

  while (current) {
    if (seen.has(current.id)) {
      throw new Error("Task tree cycle detected");
    }
    seen.add(current.id);
    path.unshift(current.title);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path.length ? path.join(" / ") : null;
}

function assertParentIsValid(parent: Task | undefined) {
  if (!parent) throw new Error("Parent task not found");
  if (parent.status === "archived") throw new Error("Cannot create a subtask under an archived task");
}

function assertTaskCanReceiveFocus(task: Task | null | undefined) {
  if (!task) throw new Error("Task not found");
  if (task.status === "archived") throw new Error("Cannot focus or attribute time to an archived task");
}

function assertTaskCanBeAssignedForFinish(task: Task | null | undefined) {
  if (!task) throw new Error("Task not found");
  if (task.status === "archived") throw new Error("Cannot reattribute a finished session to an archived task");
}

function normalizeTaskStatus(status: Exclude<Task["status"], "archived">, now: string) {
  return {
    status,
    completedAt: status === "done" ? now : null,
    archivedAt: null,
    previousStatus: null,
  };
}

function toRestorableStatus(status: Task["status"]): RestorableTaskStatus {
  if (status === "archived") {
    throw new Error("Archived status cannot be used as previousStatus");
  }

  return status;
}

export function getSubtreeTaskIds(tasks: Task[], taskId: string) {
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentId) {
      childrenByParent.set(task.parentId, [...(childrenByParent.get(task.parentId) ?? []), task]);
    }
  }

  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const child of childrenByParent.get(id) ?? []) visit(child.id);
  };
  visit(taskId);
  return ids;
}

export function computeElapsedSeconds(session: FocusSession, pauses: TimerPause[], now = Date.now()) {
  const startedAt = new Date(session.startedAt).getTime();
  const pauseMs = pauses
    .filter((pause) => pause.sessionId === session.id)
    .reduce((total, pause) => {
      const start = new Date(pause.startedAt).getTime();
      const end = pause.endedAt ? new Date(pause.endedAt).getTime() : now;
      return total + Math.max(0, end - start);
    }, 0);

  return Math.max(0, Math.floor((now - startedAt - pauseMs) / 1000));
}

function hasValidActiveShape(session: FocusSession) {
  return Boolean(session.id && session.startedAt && Number.isFinite(new Date(session.startedAt).getTime()) && session.plannedSeconds > 0);
}

function closeOpenPause(pauses: TimerPause[], now: string) {
  const openPauses = pauses.filter((pause) => pause.endedAt === null);
  if (openPauses.length > 1) throw new Error("Multiple open pauses found for this session");
  if (openPauses.length === 0) return null;

  const closedPause: TimerPause = {
    ...openPauses[0],
    endedAt: now,
    updatedAt: now,
  };
  validateTimerPauseRecord(closedPause);
  return closedPause;
}

export async function restoreActiveSession(): Promise<RecoveryNotice | null> {
  const activeSessions = await db.focusSessions.filter((session) => isActiveStatus(session.status)).toArray();
  if (activeSessions.length === 0) return null;

  const [primary, ...duplicates] = activeSessions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const now = nowIso();
  let notice: RecoveryNotice | null = null;

  await db.transaction("rw", db.focusSessions, async () => {
    for (const duplicate of duplicates) {
      await db.focusSessions.put({
        ...duplicate,
        status: "discarded",
        endedAt: now,
        updatedAt: now,
      });
      notice = { kind: "corrupt", message: "Recovered duplicate active sessions by discarding extras." };
    }
  });

  if (!hasValidActiveShape(primary)) {
    await db.focusSessions.put({
      ...primary,
      status: primary.startedAt ? "partial" : "discarded",
      endedAt: now,
      updatedAt: now,
    });
    return { kind: "corrupt", message: "Recovered an invalid active session so the app can continue safely." };
  }

  const pauses = await db.timerPauses.where("sessionId").equals(primary.id).toArray();
  const elapsed = computeElapsedSeconds(primary, pauses);
  if (primary.status === "running" && elapsed >= primary.plannedSeconds) {
    await db.focusSessions.put({
      ...primary,
      actualSeconds: elapsed,
      status: "finishing",
      updatedAt: now,
    });
    return { kind: "expired", message: "Your previous focus reached its planned duration and is ready to finish." };
  }

  if (primary.status === "paused") {
    const hasOpenPause = pauses.some((pause) => pause.endedAt === null);
    if (!hasOpenPause) {
      await db.focusSessions.put({
        ...primary,
        actualSeconds: elapsed,
        status: "partial",
        endedAt: now,
        updatedAt: now,
      });
      return { kind: "corrupt", message: "Recovered a paused session with missing pause data as a partial session." };
    }
  }

  return notice;
}

export async function loadAppSnapshot(): Promise<AppSnapshot> {
  await ensureDefaultSettings();
  const recoveryNotice = await restoreActiveSession();
  const [settings, rawTasks, sessions, interruptions, pauses] = await Promise.all([
    db.userSettings.get("local"),
    db.tasks.orderBy("sortOrder").toArray(),
    db.focusSessions.orderBy("createdAt").reverse().toArray(),
    db.interruptions.orderBy("createdAt").reverse().toArray(),
    db.timerPauses.toArray(),
  ]);
  const repairedTasks = repairArchivedSubtrees(rawTasks);

  if (repairedTasks.some((task, index) => task !== rawTasks[index])) {
    await db.transaction("rw", db.tasks, async () => {
      await db.tasks.bulkPut(repairedTasks);
    });
  }

  return {
    settings: settings ?? createDefaultSettings(),
    tasks: repairedTasks,
    sessions,
    interruptions,
    pauses,
    recoveryNotice,
  };
}

export async function createTask(title: string, parentId: string | null = null) {
  const normalized = title.trim();
  if (!normalized) {
    throw new Error("Task title is required");
  }

  const existing = parentId
    ? await db.tasks.where("parentId").equals(parentId).count()
    : await db.tasks.filter((task) => task.parentId === null).count();
  if (parentId) {
    assertParentIsValid(await db.tasks.get(parentId));
  }
  const now = nowIso();
  const task: Task = {
    id: createId(),
    parentId,
    title: normalized,
    status: "todo",
    sortOrder: existing,
    createdAt: now,
    updatedAt: now,
  };

  validateTaskRecord(task);
  await db.tasks.add(task);
  return task;
}

export async function createTaskPath(path: string) {
  const rawParts = path.split("/");
  const parts = rawParts.map((part) => part.trim());
  if (parts.length === 0 || parts.every((part) => part.length === 0)) throw new Error("Task path is required");
  if (parts.some((part) => part.length === 0)) throw new Error("Task path cannot include empty segments");

  let parentId: string | null = null;
  let current: Task | undefined;

  await db.transaction("rw", db.tasks, async () => {
    for (const title of parts) {
      const siblings = await db.tasks
        .filter((task) => task.parentId === parentId && task.status !== "archived" && task.title.toLowerCase() === title.toLowerCase())
        .toArray();
      current = siblings[0];
      if (!current) {
        const existing = parentId
          ? await db.tasks.where("parentId").equals(parentId).count()
          : await db.tasks.filter((task) => task.parentId === null).count();
        if (parentId) {
          assertParentIsValid(await db.tasks.get(parentId));
        }
        const now = nowIso();
        current = {
          id: createId(),
          parentId,
          title,
          status: "todo",
          sortOrder: existing,
          createdAt: now,
          updatedAt: now,
        };
        validateTaskRecord(current);
        await db.tasks.add(current);
      }
      parentId = current.id;
    }
  });

  if (!current) throw new Error("Failed to create task path");
  return current;
}

export async function archiveTask(taskId: string) {
  return db.transaction("rw", db.tasks, db.focusSessions, async () => {
    const tasks = await db.tasks.orderBy("sortOrder").toArray();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Task not found");

    const subtreeIds = getSubtreeTaskIds(tasks, taskId);
    const activeSessions = await db.focusSessions.filter((session) => isActiveStatus(session.status)).toArray();
    if (activeSessions.some((session) => session.taskId && subtreeIds.has(session.taskId))) {
      throw new Error("Cannot archive a branch used by the active session");
    }

    const now = nowIso();
    const updatedTasks = tasks.map((item) => {
      if (!subtreeIds.has(item.id)) return item;
      if (item.status === "archived") return item;

      const previousStatus = toRestorableStatus(item.status);
      const updated: Task = {
        ...item,
        status: "archived",
        previousStatus,
        archivedAt: now,
        completedAt: previousStatus === "done" ? item.completedAt ?? now : null,
        updatedAt: now,
      };

      validateTaskRecord(updated);
      return updated;
    });

    const changedTasks = updatedTasks.filter((item, index) => item !== tasks[index]);
    if (changedTasks.length > 0) {
      await db.tasks.bulkPut(changedTasks);
    }

    return updatedTasks.find((item) => item.id === taskId)!;
  });
}

export async function restoreTaskBranch(taskId: string) {
  return db.transaction("rw", db.tasks, async () => {
    const tasks = await db.tasks.orderBy("sortOrder").toArray();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Task not found");
    if (task.status !== "archived") throw new Error("Task is not archived");
    if (!isArchivedBranchRoot(task, tasks)) {
      throw new Error("Restore the archived branch root instead");
    }

    const subtreeIds = getSubtreeTaskIds(tasks, taskId);
    const now = nowIso();
    const updatedTasks = tasks.map((item) => {
      if (!subtreeIds.has(item.id) || item.status !== "archived") return item;

      const restoredStatus = item.previousStatus ?? "todo";
      const updated: Task = {
        ...item,
        status: restoredStatus,
        previousStatus: null,
        archivedAt: null,
        completedAt: restoredStatus === "done" ? item.completedAt ?? now : null,
        updatedAt: now,
      };

      validateTaskRecord(updated);
      return updated;
    });

    const changedTasks = updatedTasks.filter((item, index) => item !== tasks[index]);
    if (changedTasks.length > 0) {
      await db.tasks.bulkPut(changedTasks);
    }

    return updatedTasks.find((item) => item.id === taskId)!;
  });
}

export async function updateTask(taskId: string, input: { title?: string; description?: string | null; status?: Task["status"] }) {
  const task = await db.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  if (input.status === "archived") {
    throw new Error("Use archiveTask to archive a branch");
  }
  if (task.status === "archived" && input.status !== undefined) {
    throw new Error("Restore the archived branch before editing status");
  }

  const normalizedTitle = input.title?.trim();
  if (input.title !== undefined && !normalizedTitle) {
    throw new Error("Task title is required");
  }

  const now = nowIso();
  const statusPatch = input.status ? normalizeTaskStatus(input.status, now) : {};
  const updated: Task = {
    ...task,
    ...(normalizedTitle !== undefined ? { title: normalizedTitle } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || undefined } : {}),
    ...statusPatch,
    updatedAt: now,
  };

  validateTaskRecord(updated);
  await db.tasks.put(updated);
  return updated;
}

export async function moveTask(taskId: string, parentId: string | null) {
  const task = await db.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  if (task.id === parentId) throw new Error("Cannot move a task under itself");
  if (task.status === "archived") {
    throw new Error("Restore the archived branch before moving it");
  }

  if (parentId) {
    assertParentIsValid(await db.tasks.get(parentId));
    const allTasks = await db.tasks.toArray();
    if (getSubtreeTaskIds(allTasks, taskId).has(parentId)) {
      throw new Error("Cannot move a task under one of its descendants");
    }
  }

  const siblingCount = parentId
    ? await db.tasks.where("parentId").equals(parentId).count()
    : await db.tasks.filter((item) => item.parentId === null).count();
  const now = nowIso();
  const updated: Task = {
    ...task,
    parentId,
    sortOrder: siblingCount,
    updatedAt: now,
  };

  validateTaskRecord(updated);
  await db.tasks.put(updated);
  return updated;
}

export async function startFocus(taskId: string | null = null, intention?: string | null, plannedSeconds?: number) {
  const activeSession = await db.focusSessions.filter((session) => isActiveStatus(session.status)).first();
  if (activeSession) {
    throw new Error("Another focus session is already active");
  }

  const settings = (await db.userSettings.get("local")) ?? createDefaultSettings();
  const task = taskId ? await db.tasks.get(taskId) : undefined;
  if (taskId) assertTaskCanReceiveFocus(task);
  const normalizedIntention = intention?.trim() ?? "";
  if (!task && !normalizedIntention) {
    throw new Error("Choose a task or enter an intention before starting focus");
  }
  const effectivePlannedSeconds = plannedSeconds ?? settings.defaultFocusSeconds;
  if (!Number.isFinite(effectivePlannedSeconds) || effectivePlannedSeconds <= 0) {
    throw new Error("Planned duration must be positive");
  }
  const taskPathSnapshot = await computeTaskPath(task?.id ?? null);
  const now = nowIso();
  const session: FocusSession = {
    id: createId(),
    taskId: task?.id ?? null,
    originalTaskId: task?.id ?? null,
    taskPathSnapshot,
    originalTaskPathSnapshot: taskPathSnapshot,
    intention: task ? (normalizedIntention || null) : normalizedIntention,
    summary: null,
    plannedSeconds: effectivePlannedSeconds,
    actualSeconds: 0,
    status: "running",
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  validateFocusSessionRecord(session);
  await db.focusSessions.add(session);
  return session;
}

export async function pauseSession() {
  const session = await db.focusSessions.filter((item) => item.status === "running").first();
  if (!session) throw new Error("No running session to pause");

  const now = nowIso();
  const pauses = await db.timerPauses.where("sessionId").equals(session.id).toArray();
  if (pauses.some((pause) => pause.endedAt === null)) {
    throw new Error("Session already has an open pause");
  }
  const actualSeconds = computeElapsedSeconds(session, pauses);

  const pause: TimerPause = {
    id: createId(),
    sessionId: session.id,
    reason: null,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const pausedSession: FocusSession = {
    ...session,
    actualSeconds,
    status: "paused",
    updatedAt: now,
  };

  validateTimerPauseRecord(pause);
  validateFocusSessionRecord(pausedSession);
  await db.transaction("rw", db.focusSessions, db.timerPauses, async () => {
    await db.timerPauses.add(pause);
    await db.focusSessions.put(pausedSession);
  });

  return { session: pausedSession, pause };
}

export async function resumeSession() {
  const session = await db.focusSessions.filter((item) => item.status === "paused").first();
  if (!session) throw new Error("No paused session to resume");

  const pauses = await db.timerPauses.where("sessionId").equals(session.id).toArray();
  const openPauses = pauses.filter((pause) => pause.endedAt === null);
  if (openPauses.length !== 1) throw new Error("Paused session must have exactly one open pause");
  const openPause = openPauses[0];
  const now = nowIso();

  await db.transaction("rw", db.focusSessions, db.timerPauses, async () => {
    const closedPause = { ...openPause, endedAt: now, updatedAt: now };
    validateTimerPauseRecord(closedPause);
    await db.timerPauses.put(closedPause);
    const runningSession: FocusSession = {
      ...session,
      status: "running",
      updatedAt: now,
    };
    validateFocusSessionRecord(runningSession);
    await db.focusSessions.put(runningSession);
  });

  return { ...session, status: "running", updatedAt: now };
}

export async function discardSession() {
  const session = await db.focusSessions.filter((item) => isActiveStatus(item.status)).first();
  if (!session) throw new Error("No active session to discard");

  const pauses = await db.timerPauses.where("sessionId").equals(session.id).toArray();
  const now = nowIso();
  const closedPause = closeOpenPause(pauses, now);
  const effectivePauses = closedPause ? pauses.map((pause) => (pause.id === closedPause.id ? closedPause : pause)) : pauses;
  const actualSeconds = computeElapsedSeconds(session, effectivePauses);

  const discarded: FocusSession = {
    ...session,
    actualSeconds,
    status: "discarded",
    endedAt: now,
    updatedAt: now,
  };

  validateFocusSessionRecord(discarded);
  await db.transaction("rw", db.focusSessions, db.timerPauses, async () => {
    if (closedPause) await db.timerPauses.put(closedPause);
    await db.focusSessions.put(discarded);
  });
  return discarded;
}

export async function requestFinish() {
  const session = await db.focusSessions.filter((item) => item.status === "running" || item.status === "paused").first();
  if (!session) throw new Error("No active session to finish");
  return enterFinishing(session);
}

export async function expireRunningSession(sessionId: string) {
  const session = await db.focusSessions.get(sessionId);
  if (!session || session.status !== "running") throw new Error("No running session to expire");

  const pauses = await db.timerPauses.where("sessionId").equals(session.id).toArray();
  if (computeElapsedSeconds(session, pauses) < session.plannedSeconds) {
    throw new Error("Session has not reached its planned duration");
  }

  return enterFinishing(session);
}

async function enterFinishing(session: FocusSession) {
  const pauses = await db.timerPauses.where("sessionId").equals(session.id).toArray();
  const now = nowIso();
  const closedPause = closeOpenPause(pauses, now);
  const effectivePauses = closedPause ? pauses.map((pause) => (pause.id === closedPause.id ? closedPause : pause)) : pauses;
  const actualSeconds = computeElapsedSeconds(session, effectivePauses);

  const finishing: FocusSession = {
    ...session,
    actualSeconds,
    status: "finishing",
    updatedAt: now,
  };

  validateFocusSessionRecord(finishing);
  await db.transaction("rw", db.focusSessions, db.timerPauses, async () => {
    if (closedPause) await db.timerPauses.put(closedPause);
    await db.focusSessions.put(finishing);
  });
  return finishing;
}

export async function changeSessionAttribution(sessionId: string, taskId: string | null) {
  const session = await db.focusSessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "finishing" && session.status !== "completed" && session.status !== "partial") {
    throw new Error("Attribution can only be changed while finishing or after a session is saved");
  }

  const task = taskId ? await db.tasks.get(taskId) : null;
  if (taskId) assertTaskCanBeAssignedForFinish(task);
  if (!taskId && !session.intention?.trim()) throw new Error("Session must keep a task or intention");

  const now = nowIso();
  const updated: FocusSession = {
    ...session,
    taskId: task?.id ?? null,
    taskPathSnapshot: await computeTaskPath(task?.id ?? null),
    updatedAt: now,
  };

  validateFocusSessionRecord(updated);
  await db.focusSessions.put(updated);
  return updated;
}

export async function saveFinish(input: { status: "completed" | "partial"; summary?: string | null; taskId?: string | null; markTaskDone?: boolean }) {
  const session = await db.focusSessions.filter((item) => item.status === "finishing").first();
  if (!session) throw new Error("No finishing session to save");

  const task = input.taskId === undefined ? undefined : input.taskId ? await db.tasks.get(input.taskId) : null;
  const isPreservingExistingAttribution = input.taskId === undefined || input.taskId === session.taskId;
  if (input.taskId && !isPreservingExistingAttribution) {
    assertTaskCanBeAssignedForFinish(task);
  }
  const pauses = await db.timerPauses.where("sessionId").equals(session.id).toArray();
  const now = nowIso();
  const actualSeconds = computeElapsedSeconds(session, pauses);

  const finalTaskId = input.taskId === undefined ? session.taskId : task?.id ?? null;
  const finalPath =
    input.taskId === undefined || (isPreservingExistingAttribution && input.taskId === session.taskId)
      ? session.taskPathSnapshot
      : await computeTaskPath(task?.id ?? null);
  if (!finalTaskId && !session.intention?.trim()) throw new Error("Session must keep a task or intention");
  const taskToMarkDone = input.markTaskDone && finalTaskId ? await db.tasks.get(finalTaskId) : null;
  if (input.markTaskDone && finalTaskId && !taskToMarkDone) throw new Error("Task not found");
  if (input.markTaskDone && taskToMarkDone?.status === "archived") {
    throw new Error("Restore the archived branch before marking it done");
  }

  const saved: FocusSession = {
    ...session,
    taskId: finalTaskId,
    taskPathSnapshot: finalPath,
    summary: input.summary?.trim() || null,
    actualSeconds,
    status: input.status,
    endedAt: now,
    updatedAt: now,
  };

  const completedTask: Task | null = taskToMarkDone
    ? {
        ...taskToMarkDone,
        status: "done",
        completedAt: now,
        archivedAt: null,
        updatedAt: now,
      }
    : null;

  validateFocusSessionRecord(saved);
  if (completedTask) validateTaskRecord(completedTask);
  await db.transaction("rw", db.focusSessions, db.tasks, async () => {
    await db.focusSessions.put(saved);
    if (completedTask) await db.tasks.put(completedTask);
  });
  return saved;
}

export async function exportJson(): Promise<PomotreeExport> {
  const snapshot = await loadAppSnapshot();
  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    tasks: snapshot.tasks,
    focusSessions: snapshot.sessions,
    timerPauses: snapshot.pauses,
    interruptions: snapshot.interruptions,
    userSettings: snapshot.settings,
  };
}

export async function importJson(input: string | unknown): Promise<AppSnapshot> {
  const exportData = parsePomotreeExport(input);
  const repairedTasks = repairArchivedSubtrees(exportData.tasks);
  const repairedExport = {
    ...exportData,
    tasks: repairedTasks,
  };
  validatePomotreeExport(repairedExport);

  await db.transaction("rw", [db.tasks, db.focusSessions, db.timerPauses, db.interruptions, db.userSettings], async () => {
    await db.tasks.clear();
    await db.focusSessions.clear();
    await db.timerPauses.clear();
    await db.interruptions.clear();
    await db.userSettings.clear();
    await db.tasks.bulkPut(repairedExport.tasks);
    await db.focusSessions.bulkPut(repairedExport.focusSessions);
    await db.timerPauses.bulkPut(repairedExport.timerPauses);
    await db.interruptions.bulkPut(repairedExport.interruptions);
    await db.userSettings.put(repairedExport.userSettings);
  });

  return loadAppSnapshot();
}

export async function updateSettings(input: SettingsUpdate) {
  await ensureDefaultSettings();
  const existing = (await db.userSettings.get("local")) ?? createDefaultSettings();

  if (input.defaultFocusSeconds !== undefined && input.defaultFocusSeconds <= 0) {
    throw new Error("Default focus duration must be positive");
  }
  if (input.defaultBreakSeconds !== undefined && input.defaultBreakSeconds <= 0) {
    throw new Error("Default break duration must be positive");
  }

  const updated: UserSettings = {
    ...existing,
    ...input,
    id: "local",
    updatedAt: nowIso(),
  };

  validateUserSettingsRecord(updated);
  await db.userSettings.put(updated);
  return updated;
}

export async function createInterruption(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("Interruption text is required");
  }

  const activeSession = await db.focusSessions.filter((item) => isActiveStatus(item.status)).first();
  const now = nowIso();
  const interruption: Interruption = {
    id: createId(),
    sessionId: activeSession?.id ?? null,
    taskId: activeSession?.taskId ?? null,
    text: normalized,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  validateInterruptionRecord(interruption);
  await db.interruptions.add(interruption);
  return interruption;
}

export async function dismissInterruption(interruptionId: string) {
  return updateInterruptionStatus(interruptionId, "dismissed");
}

export async function markInterruptionDone(interruptionId: string) {
  return updateInterruptionStatus(interruptionId, "done");
}

async function updateInterruptionStatus(interruptionId: string, status: "dismissed" | "done") {
  const interruption = await db.interruptions.get(interruptionId);
  if (!interruption) throw new Error("Interruption not found");

  const updated: Interruption = {
    ...interruption,
    status,
    convertedToTaskId: null,
    updatedAt: nowIso(),
  };

  validateInterruptionRecord(updated);
  await db.interruptions.put(updated);
  return updated;
}

export async function convertInterruptionToTask(interruptionId: string, parentId: string | null = null) {
  const interruption = await db.interruptions.get(interruptionId);
  if (!interruption) throw new Error("Interruption not found");
  if (interruption.status !== "open") throw new Error("Only open interruptions can be converted");

  const normalized = interruption.text.trim();
  if (!normalized) throw new Error("Interruption text is required");
  if (parentId) assertParentIsValid(await db.tasks.get(parentId));

  const now = nowIso();
  const siblingCount = parentId
    ? await db.tasks.where("parentId").equals(parentId).count()
    : await db.tasks.filter((task) => task.parentId === null).count();
  const task: Task = {
    id: createId(),
    parentId,
    title: normalized,
    status: "todo",
    sortOrder: siblingCount,
    createdAt: now,
    updatedAt: now,
  };
  const converted: Interruption = {
    ...interruption,
    status: "converted",
    convertedToTaskId: task.id,
    updatedAt: now,
  };

  validateTaskRecord(task);
  validateInterruptionRecord(converted);
  await db.transaction("rw", db.tasks, db.interruptions, async () => {
    await db.tasks.add(task);
    await db.interruptions.put(converted);
  });

  return { task, interruption: converted };
}

export function repairArchivedSubtrees(tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const now = nowIso();

  const findArchivedAncestor = (task: Task) => {
    const seen = new Set<string>();
    let current = task.parentId ? byId.get(task.parentId) : undefined;

    while (current) {
      if (seen.has(current.id)) {
        throw new Error("Task tree cycle detected");
      }
      seen.add(current.id);
      if (current.status === "archived") return current;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    return undefined;
  };

  return tasks.map((task) => {
    if (task.status === "archived") return task;

    const archivedAncestor = findArchivedAncestor(task);
    if (!archivedAncestor) return task;

    const previousStatus = toRestorableStatus(task.status);
    const repaired: Task = {
      ...task,
      status: "archived",
      previousStatus,
      archivedAt: archivedAncestor.archivedAt ?? now,
      completedAt: previousStatus === "done" ? task.completedAt ?? now : null,
      updatedAt: now,
    };

    validateTaskRecord(repaired);
    return repaired;
  });
}
