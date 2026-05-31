import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDefaultSettings } from "@/lib/db/defaults";
import type { FocusSession, Task, TimerPause } from "@/types/domain";
import {
  archiveTask,
  changeSessionAttribution,
  computeElapsedSeconds,
  convertInterruptionToTask,
  createInterruption,
  createTask,
  createTaskPath,
  discardSession,
  dismissInterruption,
  expireRunningSession,
  exportJson,
  importJson,
  loadAppSnapshot,
  markInterruptionDone,
  moveTask,
  pauseSession,
  repairArchivedSubtrees,
  requestFinish,
  restoreActiveSession,
  restoreTaskBranch,
  resumeSession,
  saveFinish,
  startFocus,
  updateSettings,
  updateTask,
} from "./pomotree";

async function seedSettings(overrides: Partial<ReturnType<typeof createDefaultSettings>> = {}) {
  await db.userSettings.put({ ...createDefaultSettings(), ...overrides });
}

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  const now = "2026-05-25T10:00:00.000Z";
  return {
    id: overrides.id ?? "session-1",
    taskId: overrides.taskId ?? null,
    originalTaskId: overrides.originalTaskId ?? null,
    taskPathSnapshot: overrides.taskPathSnapshot ?? null,
    originalTaskPathSnapshot: overrides.originalTaskPathSnapshot ?? null,
    intention: overrides.intention ?? "test",
    summary: overrides.summary ?? null,
    plannedSeconds: overrides.plannedSeconds ?? 1500,
    actualSeconds: overrides.actualSeconds ?? 0,
    status: overrides.status ?? "running",
    startedAt: overrides.startedAt ?? now,
    endedAt: overrides.endedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function makePause(overrides: Partial<TimerPause> = {}): TimerPause {
  const now = "2026-05-25T10:05:00.000Z";
  return {
    id: overrides.id ?? "pause-1",
    sessionId: overrides.sessionId ?? "session-1",
    reason: overrides.reason ?? null,
    startedAt: overrides.startedAt ?? now,
    endedAt: overrides.endedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe("pomotree service invariants", () => {
  it("archives and restores an entire subtree and keeps move protections", async () => {
    const parent = await createTask(" Parent ");
    const child = await createTask("Child", parent.id);
    const grandchild = await createTask("Grandchild", child.id);

    await expect(updateTask(child.id, { title: "" })).rejects.toThrow("Task title is required");
    await expect(moveTask(parent.id, child.id)).rejects.toThrow("descendants");

    const updated = await updateTask(child.id, { title: "Renamed", status: "done" });
    expect(updated.title).toBe("Renamed");
    expect(updated.completedAt).toBeTruthy();

    const archived = await archiveTask(parent.id);
    expect(archived.status).toBe("archived");
    expect((await db.tasks.get(parent.id))?.previousStatus).toBe("todo");
    expect((await db.tasks.get(child.id))?.previousStatus).toBe("done");
    expect((await db.tasks.get(grandchild.id))?.status).toBe("archived");
    await expect(createTask("Blocked", parent.id)).rejects.toThrow("archived");
    await expect(updateTask(parent.id, { status: "archived" })).rejects.toThrow("Use archiveTask");
    await expect(moveTask(parent.id, null)).rejects.toThrow("Restore the archived branch before moving it");

    const restored = await restoreTaskBranch(parent.id);
    expect(restored.status).toBe("todo");
    expect((await db.tasks.get(parent.id))?.previousStatus).toBeNull();
    expect((await db.tasks.get(child.id))?.status).toBe("done");
    expect((await db.tasks.get(child.id))?.completedAt).toBeTruthy();
    expect((await db.tasks.get(grandchild.id))?.status).toBe("todo");
  });

  it("creates task paths atomically and rejects empty path segments", async () => {
    await expect(createTaskPath("Project // Draft")).rejects.toThrow("empty segments");
    expect(await db.tasks.count()).toBe(0);

    const leaf = await createTaskPath("Project / Draft");
    expect(leaf.title).toBe("Draft");
    expect(await db.tasks.count()).toBe(2);
  });

  it("requires a task or intention and blocks concurrent active sessions", async () => {
    await seedSettings({ defaultFocusSeconds: 60 });
    await expect(startFocus(null, "   ")).rejects.toThrow("Choose a task or enter an intention");

    const session = await startFocus(null, "Write a spec", 50 * 60);
    expect(session.intention).toBe("Write a spec");
    expect(session.plannedSeconds).toBe(50 * 60);
    await expect(startFocus(null, "Second focus")).rejects.toThrow("already active");
  });

  it("preserves original attribution while changing actual attribution", async () => {
    await seedSettings();
    const original = await createTask("Original");
    const actual = await createTask("Actual");

    const started = await startFocus(original.id);
    await requestFinish();
    const changed = await changeSessionAttribution(started.id, actual.id);

    expect(changed.originalTaskId).toBe(original.id);
    expect(changed.originalTaskPathSnapshot).toBe("Original");
    expect(changed.taskId).toBe(actual.id);
    expect(changed.taskPathSnapshot).toBe("Actual");

    const saved = await saveFinish({ status: "completed", summary: "done" });
    expect(saved.originalTaskId).toBe(original.id);
    expect(saved.taskId).toBe(actual.id);
  });

  it("rejects archived or empty final attribution", async () => {
    await seedSettings();
    const archived = await createTask("Archived target");
    await archiveTask(archived.id);
    await expect(startFocus(archived.id)).rejects.toThrow("archived");

    const regular = await createTask("Regular target");
    const started = await startFocus(regular.id);
    await requestFinish();
    await expect(changeSessionAttribution(started.id, null)).rejects.toThrow("task or intention");
    await expect(changeSessionAttribution(started.id, archived.id)).rejects.toThrow("archived");
    await expect(saveFinish({ status: "completed", taskId: null })).rejects.toThrow("task or intention");
    await expect(saveFinish({ status: "completed", taskId: archived.id })).rejects.toThrow("archived");
  });

  it("rejects marking an archived task done while finishing a legacy archived session", async () => {
    await seedSettings();
    const archivedTask: Task = {
      id: "archived-mark-done",
      parentId: null,
      title: "Archived mark done",
      status: "archived",
      previousStatus: "todo",
      sortOrder: 0,
      createdAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T10:00:00.000Z",
      archivedAt: "2026-05-25T10:00:00.000Z",
    };

    await db.tasks.put(archivedTask);
    await db.focusSessions.put(
      makeSession({
        id: "legacy-mark-done-session",
        taskId: archivedTask.id,
        originalTaskId: archivedTask.id,
        taskPathSnapshot: archivedTask.title,
        originalTaskPathSnapshot: archivedTask.title,
        status: "finishing",
        intention: null,
      }),
    );

    await expect(saveFinish({ status: "completed", markTaskDone: true })).rejects.toThrow(
      "Restore the archived branch before marking it done",
    );
    expect((await db.tasks.get(archivedTask.id))?.status).toBe("archived");
    expect((await db.focusSessions.get("legacy-mark-done-session"))?.status).toBe("finishing");
  });

  it("blocks archiving a branch used by the active session", async () => {
    await seedSettings();
    const task = await createTask("Active branch");
    await startFocus(task.id);
    await expect(archiveTask(task.id)).rejects.toThrow("Cannot archive a branch used by the active session");
  });

  it("allows saving a finishing session that is already attributed to an archived task in legacy data", async () => {
    await seedSettings();
    const archivedTask: Task = {
      id: "archived-task",
      parentId: null,
      title: "Archived finish target",
      status: "archived",
      previousStatus: "todo",
      sortOrder: 0,
      createdAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T10:00:00.000Z",
      archivedAt: "2026-05-25T10:00:00.000Z",
    };
    const session = makeSession({
      id: "legacy-finishing",
      taskId: archivedTask.id,
      originalTaskId: archivedTask.id,
      taskPathSnapshot: archivedTask.title,
      originalTaskPathSnapshot: archivedTask.title,
      status: "finishing",
      intention: null,
    });

    await db.tasks.put(archivedTask);
    await db.focusSessions.put(session);
    const saved = await saveFinish({ status: "completed", summary: "done" });

    expect(saved.taskId).toBe(archivedTask.id);
    expect(saved.status).toBe("completed");
    await expect(saveFinish({ status: "completed", markTaskDone: true })).rejects.toThrow("No finishing session");
  });

  it("recomputes finish duration at save time after time spent on the finishing screen", async () => {
    const saveTime = Date.now();
    const startedAt = new Date(saveTime - 2 * 60 * 60 * 1000).toISOString();
    await db.focusSessions.put(
      makeSession({
        id: "long-finishing-dwell",
        status: "finishing",
        startedAt,
        endedAt: null,
        actualSeconds: 1500,
        updatedAt: new Date(saveTime - 95 * 60 * 1000).toISOString(),
      }),
    );

    const saved = await saveFinish({ status: "completed", summary: "saved late" });

    expect(saved.actualSeconds).toBeGreaterThanOrEqual(7199);
    expect(saved.actualSeconds).toBeLessThanOrEqual(7201);
    expect(saved.endedAt).toBeTruthy();
    expect(new Date(saved.endedAt!).getTime()).toBeGreaterThanOrEqual(saveTime);
  });

  it("keeps saved history snapshots stable after task rename", async () => {
    await seedSettings();
    const task = await createTask("Original name");

    await startFocus(task.id);
    await requestFinish();
    const saved = await saveFinish({ status: "completed", summary: "snapshot test" });
    await updateTask(task.id, { title: "Renamed later" });

    const reloaded = await db.focusSessions.get(saved.id);
    expect(reloaded?.taskPathSnapshot).toBe("Original name");
  });

  it("can atomically mark the attributed task done when saving finish", async () => {
    await seedSettings();
    const task = await createTask("Finishable");

    await startFocus(task.id);
    await requestFinish();
    await saveFinish({ status: "completed", taskId: task.id, markTaskDone: true });

    const savedTask = await db.tasks.get(task.id);
    expect(savedTask?.status).toBe("done");
    expect(savedTask?.completedAt).toBeTruthy();
  });

  it("marks a parent done without changing child tasks", async () => {
    const parent = await createTask("Parent");
    const child = await createTask("Child", parent.id);

    await updateTask(parent.id, { status: "done" });

    expect((await db.tasks.get(parent.id))?.status).toBe("done");
    expect((await db.tasks.get(child.id))?.status).toBe("todo");
  });

  it("keeps focus history unchanged across archive and restore", async () => {
    await seedSettings();
    const parent = await createTask("History parent");
    const child = await createTask("History child", parent.id);

    await startFocus(child.id);
    await requestFinish();
    await saveFinish({ status: "completed", summary: "history check" });
    const before = await db.focusSessions.toArray();

    await archiveTask(parent.id);
    await restoreTaskBranch(parent.id);

    expect(await db.focusSessions.toArray()).toEqual(before);
  });

  it("restores only archived branch roots", async () => {
    const parent = await createTask("Archive root");
    const child = await createTask("Archive child", parent.id);
    await archiveTask(parent.id);

    await expect(restoreTaskBranch(child.id)).rejects.toThrow("Restore the archived branch root instead");
  });

  it("ignores archived siblings when creating task paths", async () => {
    const archivedProject = await createTask("Project");
    await archiveTask(archivedProject.id);

    const leaf = await createTaskPath("Project / New");
    const rootProjects = (await db.tasks.toArray()).filter((task) => task.parentId === null && task.title === "Project");

    expect(rootProjects).toHaveLength(2);
    expect(rootProjects.find((task) => task.id === leaf.parentId)?.status).toBe("todo");
  });

  it("computes wall-clock elapsed time with pauses and closes open pauses on resume", async () => {
    await seedSettings();
    const started = await startFocus(null, "Pause math");
    await pauseSession();
    const pause = await db.timerPauses.where("sessionId").equals(started.id).first();
    expect(pause?.endedAt).toBeNull();

    await resumeSession();
    const closedPause = await db.timerPauses.get(pause!.id);
    expect(closedPause?.endedAt).toBeTruthy();

    const session = makeSession({ startedAt: "2026-05-25T10:00:00.000Z" });
    const pauses = [makePause({ startedAt: "2026-05-25T10:05:00.000Z", endedAt: "2026-05-25T10:07:00.000Z" })];
    expect(computeElapsedSeconds(session, pauses, new Date("2026-05-25T10:10:00.000Z").getTime())).toBe(480);
  });

  it("requires exactly one open pause before resume", async () => {
    await db.focusSessions.add(makeSession({ id: "paused-without-open", status: "paused" }));

    await expect(resumeSession()).rejects.toThrow("exactly one open pause");
  });

  it("closes open pauses when finishing or discarding a paused session", async () => {
    await seedSettings();
    const finishingCandidate = await startFocus(null, "Finish while paused");
    await pauseSession();
    await requestFinish();
    expect((await db.focusSessions.get(finishingCandidate.id))?.status).toBe("finishing");
    expect((await db.timerPauses.where("sessionId").equals(finishingCandidate.id).toArray()).every((pause) => pause.endedAt)).toBe(true);

    await saveFinish({ status: "partial" });
    const discardCandidate = await startFocus(null, "Discard while paused");
    await pauseSession();
    await discardSession();
    expect((await db.focusSessions.get(discardCandidate.id))?.status).toBe("discarded");
    expect((await db.timerPauses.where("sessionId").equals(discardCandidate.id).toArray()).every((pause) => pause.endedAt)).toBe(true);
  });

  it("expires a running session only after planned duration is reached", async () => {
    await seedSettings();
    const session = await startFocus(null, "Short focus", 1);

    await expect(expireRunningSession(session.id)).rejects.toThrow("not reached");

    await db.focusSessions.put({
      ...session,
      startedAt: new Date(Date.now() - 5000).toISOString(),
      updatedAt: new Date(Date.now() - 5000).toISOString(),
    });

    const expired = await expireRunningSession(session.id);
    expect(expired.status).toBe("finishing");
    expect(expired.actualSeconds).toBeGreaterThanOrEqual(1);
  });

  it("converts, dismisses, and completes interruptions without changing timer state", async () => {
    await seedSettings();
    const active = await startFocus(null, "Deep work");
    const interruption = await createInterruption(" Reply to teammate ");

    const converted = await convertInterruptionToTask(interruption.id);
    expect(converted.task.title).toBe("Reply to teammate");
    expect(converted.interruption.status).toBe("converted");
    expect((await db.focusSessions.get(active.id))?.status).toBe("running");

    const dismissible = await createInterruption("Dismiss me");
    expect((await dismissInterruption(dismissible.id)).status).toBe("dismissed");
    const done = await createInterruption("Done note");
    expect((await markInterruptionDone(done.id)).status).toBe("done");
  });

  it("recovers duplicate, expired, and corrupt active sessions", async () => {
    await db.focusSessions.bulkAdd([
      makeSession({ id: "primary", status: "running", startedAt: "2026-05-25T09:00:00.000Z", createdAt: "2026-05-25T09:00:00.000Z", plannedSeconds: 1 }),
      makeSession({ id: "duplicate", status: "paused", createdAt: "2026-05-25T09:01:00.000Z" }),
    ]);

    const notice = await restoreActiveSession();
    expect(notice?.kind).toBe("expired");
    expect((await db.focusSessions.get("primary"))?.status).toBe("finishing");
    expect((await db.focusSessions.get("duplicate"))?.status).toBe("discarded");
  });

  it("persists settings and includes schema version in JSON export", async () => {
    await updateSettings({ defaultFocusSeconds: 50 * 60, theme: "dark", enableNotifications: true });
    await createTask("Exported task");

    const exported = await exportJson();

    expect(exported.schemaVersion).toBe(2);
    expect(exported.labels).toEqual([]);
    expect(exported.userSettings.defaultFocusSeconds).toBe(50 * 60);
    expect(exported.userSettings.theme).toBe("dark");
    expect(exported.userSettings.enableNotifications).toBe(true);
    expect(exported.tasks).toHaveLength(1);
  });


  it("auto-creates task labels and deduplicates names case-insensitively", async () => {
    const task = await createTask("Label target");

    const updated = await updateTask(task.id, { labelNames: [" Work ", "work", "Home", ""] });
    const labels = await db.taskLabels.orderBy("sortOrder").toArray();

    expect(labels.map((label) => label.name)).toEqual(["Work", "Home"]);
    expect(updated.labelIds).toEqual(labels.map((label) => label.id));

    await updateTask(task.id, { labelNames: ["home", "Deep Work"] });
    const finalLabels = await db.taskLabels.orderBy("sortOrder").toArray();
    expect(finalLabels.map((label) => label.name)).toEqual(["Work", "Home", "Deep Work"]);
    expect((await db.tasks.get(task.id))?.labelIds).toEqual([finalLabels[1].id, finalLabels[2].id]);
  });

  it("exports and imports v2 labels with task label ids", async () => {
    const task = await createTask("Tagged export");
    await updateTask(task.id, { labelNames: ["Work", "Urgent"] });

    const exported = await exportJson();
    await db.tasks.clear();
    await db.taskLabels.clear();
    await importJson(exported);

    expect((await db.taskLabels.orderBy("sortOrder").toArray()).map((label) => label.name)).toEqual(["Work", "Urgent"]);
    expect((await db.tasks.get(task.id))?.labelIds).toEqual(exported.tasks[0].labelIds);
  });

  it("imports a Pomotree export by replacing local data atomically", async () => {
    await createTask("Local task");
    const importedTask = {
      id: "imported-task",
      parentId: null,
      title: "Imported task",
      status: "todo" as const,
      sortOrder: 0,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    const importedSettings = { ...createDefaultSettings(), defaultFocusSeconds: 50 * 60 };

    await importJson({
      schemaVersion: 1,
      exportedAt: "2026-05-26T00:00:00.000Z",
      tasks: [importedTask],
      focusSessions: [],
      timerPauses: [],
      interruptions: [],
      userSettings: importedSettings,
    });

    expect(await db.tasks.toArray()).toEqual([{ ...importedTask, labelIds: [] }]);
    expect(await db.taskLabels.toArray()).toEqual([]);
    expect((await db.userSettings.get("local"))?.defaultFocusSeconds).toBe(50 * 60);
  });

  it("repairs archived subtrees during import and snapshot load", async () => {
    const parent: Task = {
      id: "archived-parent",
      parentId: null,
      title: "Archived parent",
      status: "archived",
      previousStatus: "todo",
      sortOrder: 0,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
      archivedAt: "2026-05-26T00:00:00.000Z",
    };
    const child: Task = {
      id: "active-child",
      parentId: parent.id,
      title: "Active child",
      status: "active",
      sortOrder: 0,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };

    const repaired = repairArchivedSubtrees([parent, child]);
    expect(repaired.find((task) => task.id === child.id)?.status).toBe("archived");
    expect(repaired.find((task) => task.id === child.id)?.previousStatus).toBe("active");

    await importJson({
      schemaVersion: 1,
      exportedAt: "2026-05-26T00:00:00.000Z",
      tasks: [parent, child],
      focusSessions: [],
      timerPauses: [],
      interruptions: [],
      userSettings: createDefaultSettings(),
    });

    expect((await db.tasks.get(child.id))?.status).toBe("archived");
    await db.tasks.clear();
    await db.tasks.bulkPut([parent, child]);

    const snapshot = await loadAppSnapshot();
    expect(snapshot.tasks.find((task) => task.id === child.id)?.status).toBe("archived");
    expect((await db.tasks.get(child.id))?.previousStatus).toBe("active");
  });

  it("rejects invalid previousStatus imports without clearing existing data", async () => {
    await createTask("Keep me");

    await expect(
      importJson({
        schemaVersion: 1,
        exportedAt: "2026-05-26T00:00:00.000Z",
        tasks: [
          {
            id: "bad-task",
            parentId: null,
            title: "Bad",
            status: "archived",
            previousStatus: "archived",
            sortOrder: 0,
            createdAt: "2026-05-26T00:00:00.000Z",
            updatedAt: "2026-05-26T00:00:00.000Z",
            archivedAt: "2026-05-26T00:00:00.000Z",
          },
        ],
        focusSessions: [],
        timerPauses: [],
        interruptions: [],
        userSettings: createDefaultSettings(),
      }),
    ).rejects.toThrow("previousStatus");

    expect((await db.tasks.toArray()).map((task) => task.title)).toEqual(["Keep me"]);
  });

  it("rejects invalid imports without clearing existing data", async () => {
    await createTask("Keep me");

    await expect(importJson({ schemaVersion: 99 })).rejects.toThrow("Unsupported");

    expect((await db.tasks.toArray()).map((task) => task.title)).toEqual(["Keep me"]);
  });
});
