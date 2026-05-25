import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDefaultSettings } from "@/lib/db/defaults";
import type { FocusSession, TimerPause } from "@/types/domain";
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
  markInterruptionDone,
  moveTask,
  pauseSession,
  requestFinish,
  restoreActiveSession,
  resumeSession,
  saveFinish,
  startFocus,
  updateSettings,
  updateTask,
  exportJson,
  importJson,
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
  it("creates, updates, archives, and move-protects task trees", async () => {
    const parent = await createTask(" Parent ");
    const child = await createTask("Child", parent.id);

    await expect(updateTask(child.id, { title: "" })).rejects.toThrow("Task title is required");
    await expect(moveTask(parent.id, child.id)).rejects.toThrow("descendants");

    const updated = await updateTask(child.id, { title: "Renamed", status: "done" });
    expect(updated.title).toBe("Renamed");
    expect(updated.completedAt).toBeTruthy();

    const archived = await archiveTask(parent.id);
    expect(archived.status).toBe("archived");
    await expect(createTask("Blocked", parent.id)).rejects.toThrow("archived");
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

    expect(exported.schemaVersion).toBe(1);
    expect(exported.userSettings.defaultFocusSeconds).toBe(50 * 60);
    expect(exported.userSettings.theme).toBe("dark");
    expect(exported.userSettings.enableNotifications).toBe(true);
    expect(exported.tasks).toHaveLength(1);
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

    expect(await db.tasks.toArray()).toEqual([importedTask]);
    expect((await db.userSettings.get("local"))?.defaultFocusSeconds).toBe(50 * 60);
  });

  it("rejects invalid imports without clearing existing data", async () => {
    await createTask("Keep me");

    await expect(importJson({ schemaVersion: 99 })).rejects.toThrow("Unsupported");

    expect((await db.tasks.toArray()).map((task) => task.title)).toEqual(["Keep me"]);
  });
});
