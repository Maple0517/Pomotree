import type { FocusSession, Interruption, Task, TimerPause, UserSettings } from "@/types/domain";

function hasValidDate(value: string | null | undefined) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function assertNonEmpty(value: string, message: string) {
  if (value.trim().length === 0) throw new Error(message);
}

export function validateTaskRecord(task: Task) {
  assertNonEmpty(task.title, "Task title is required");
  const validPreviousStatus =
    task.previousStatus === undefined ||
    task.previousStatus === null ||
    task.previousStatus === "todo" ||
    task.previousStatus === "active" ||
    task.previousStatus === "done";

  if (!validPreviousStatus) {
    throw new Error("previousStatus must be todo, active, done, null, or undefined");
  }

  if (task.status === "archived") {
    if (!task.archivedAt) {
      throw new Error("Archived tasks require archivedAt");
    }
    if (task.previousStatus !== "done" && task.completedAt) {
      throw new Error("Only archived tasks previously done can keep completedAt");
    }
  } else {
    if (task.previousStatus !== undefined && task.previousStatus !== null) {
      throw new Error("previousStatus is only valid for archived tasks");
    }
    if (task.archivedAt) {
      throw new Error("archivedAt is only valid for archived tasks");
    }
  }

  if (task.completedAt && task.status !== "done" && !(task.status === "archived" && task.previousStatus === "done")) {
    throw new Error("completedAt is only valid for done tasks");
  }
  if (task.status === "done" && !task.completedAt) {
    throw new Error("Done tasks require completedAt");
  }
  if (task.status !== "done" && task.status !== "archived" && task.completedAt) {
    throw new Error("completedAt is only valid for done tasks");
  }
  if (!hasValidDate(task.createdAt) || !hasValidDate(task.updatedAt)) {
    throw new Error("Task timestamps must be valid ISO strings");
  }
}

export function validateFocusSessionRecord(session: FocusSession) {
  if (session.plannedSeconds <= 0) throw new Error("Planned duration must be positive");
  if (session.actualSeconds < 0) throw new Error("Actual duration cannot be negative");
  if (session.taskId === null && !session.intention?.trim()) {
    throw new Error("Focus session requires a task or intention");
  }
  if (["completed", "partial", "discarded"].includes(session.status) && !session.endedAt) {
    throw new Error("Terminal sessions require endedAt");
  }
  if (!hasValidDate(session.startedAt) || !hasValidDate(session.createdAt) || !hasValidDate(session.updatedAt)) {
    throw new Error("Focus session timestamps must be valid ISO strings");
  }
  if (session.endedAt && !hasValidDate(session.endedAt)) {
    throw new Error("Focus session endedAt must be a valid ISO string");
  }
}

export function validateTimerPauseRecord(pause: TimerPause) {
  if (!pause.sessionId) throw new Error("Timer pause requires a session");
  if (!hasValidDate(pause.startedAt) || !hasValidDate(pause.createdAt) || !hasValidDate(pause.updatedAt)) {
    throw new Error("Timer pause timestamps must be valid ISO strings");
  }
  if (pause.endedAt) {
    if (!hasValidDate(pause.endedAt)) throw new Error("Timer pause endedAt must be a valid ISO string");
    if (new Date(pause.endedAt).getTime() < new Date(pause.startedAt).getTime()) {
      throw new Error("Timer pause endedAt cannot be before startedAt");
    }
  }
}

export function validateInterruptionRecord(interruption: Interruption) {
  assertNonEmpty(interruption.text, "Interruption text is required");
  if (interruption.status === "converted" && !interruption.convertedToTaskId) {
    throw new Error("Converted interruptions require convertedToTaskId");
  }
  if (interruption.status !== "converted" && interruption.convertedToTaskId) {
    throw new Error("Only converted interruptions can reference convertedToTaskId");
  }
  if (interruption.status === "snoozed" && !interruption.snoozedUntil) {
    throw new Error("Snoozed interruptions require snoozedUntil");
  }
  if (!hasValidDate(interruption.createdAt) || !hasValidDate(interruption.updatedAt)) {
    throw new Error("Interruption timestamps must be valid ISO strings");
  }
}

export function validateUserSettingsRecord(settings: UserSettings) {
  if (settings.id !== "local") throw new Error("User settings id must be local");
  if (settings.defaultFocusSeconds <= 0) throw new Error("Default focus duration must be positive");
  if (settings.defaultBreakSeconds <= 0) throw new Error("Default break duration must be positive");
  if (!["light", "dark", "system"].includes(settings.theme)) {
    throw new Error("Theme must be light, dark, or system");
  }
  if (!hasValidDate(settings.createdAt) || !hasValidDate(settings.updatedAt)) {
    throw new Error("User settings timestamps must be valid ISO strings");
  }
}
