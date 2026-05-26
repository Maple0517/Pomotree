import { describe, expect, it } from "vitest";
import type { FocusSession, Interruption, Task, UserSettings } from "@/types/domain";
import {
  validateFocusSessionRecord,
  validateInterruptionRecord,
  validateTaskRecord,
  validateUserSettingsRecord,
} from "./domain";

const now = "2026-05-26T00:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task",
    parentId: null,
    title: "Task",
    status: "todo",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "session",
    taskId: "task",
    originalTaskId: "task",
    taskPathSnapshot: "Task",
    originalTaskPathSnapshot: "Task",
    intention: null,
    summary: null,
    plannedSeconds: 1500,
    actualSeconds: 0,
    status: "running",
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeInterruption(overrides: Partial<Interruption> = {}): Interruption {
  return {
    id: "interruption",
    sessionId: null,
    taskId: null,
    text: "Follow up",
    status: "open",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: "local",
    defaultFocusSeconds: 1500,
    defaultBreakSeconds: 300,
    enableNotifications: false,
    theme: "system",
    autoStartBreak: false,
    autoStartNextFocus: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("domain validators", () => {
  it("enforces task timestamp/status consistency", () => {
    expect(() => validateTaskRecord(makeTask({ title: "  " }))).toThrow("Task title is required");
    expect(() => validateTaskRecord(makeTask({ status: "done" }))).toThrow("Done tasks require completedAt");
    expect(() => validateTaskRecord(makeTask({ status: "archived", archivedAt: now }))).not.toThrow();
    expect(() => validateTaskRecord(makeTask({ status: "archived", archivedAt: now, previousStatus: "archived" as never }))).toThrow("previousStatus");
    expect(() => validateTaskRecord(makeTask({ status: "todo", previousStatus: "todo" }))).toThrow("previousStatus");
    expect(() =>
      validateTaskRecord(makeTask({ status: "archived", archivedAt: now, previousStatus: "done", completedAt: now })),
    ).not.toThrow();
  });

  it("enforces focus session duration and terminal fields", () => {
    expect(() => validateFocusSessionRecord(makeSession({ plannedSeconds: 0 }))).toThrow("Planned duration");
    expect(() => validateFocusSessionRecord(makeSession({ taskId: null, intention: "" }))).toThrow("requires a task or intention");
    expect(() => validateFocusSessionRecord(makeSession({ taskId: null, originalTaskId: "task", intention: "" }))).toThrow("requires a task or intention");
    expect(() => validateFocusSessionRecord(makeSession({ status: "completed", endedAt: now }))).not.toThrow();
    expect(() => validateFocusSessionRecord(makeSession({ status: "completed" }))).toThrow("Terminal sessions require endedAt");
  });

  it("enforces interruption conversion fields", () => {
    expect(() => validateInterruptionRecord(makeInterruption({ text: "" }))).toThrow("Interruption text is required");
    expect(() => validateInterruptionRecord(makeInterruption({ status: "converted" }))).toThrow("convertedToTaskId");
    expect(() => validateInterruptionRecord(makeInterruption({ status: "converted", convertedToTaskId: "task" }))).not.toThrow();
  });

  it("enforces settings bounds", () => {
    expect(() => validateUserSettingsRecord(makeSettings({ defaultFocusSeconds: 0 }))).toThrow("Default focus duration");
    expect(() => validateUserSettingsRecord(makeSettings({ theme: "dark" }))).not.toThrow();
  });
});
