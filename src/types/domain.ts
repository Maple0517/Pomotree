export type EntityId = string;
export type ISODateTimeString = string;

export type TaskStatus = "todo" | "active" | "done" | "archived";
export type RestorableTaskStatus = "todo" | "active" | "done";

export interface Task {
  id: EntityId;
  parentId: EntityId | null;
  title: string;
  description?: string;
  status: TaskStatus;
  previousStatus?: RestorableTaskStatus | null;
  sortOrder: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  completedAt?: ISODateTimeString | null;
  archivedAt?: ISODateTimeString | null;
}

export type FocusSessionStatus =
  | "running"
  | "paused"
  | "finishing"
  | "completed"
  | "partial"
  | "discarded";

export interface FocusSession {
  id: EntityId;
  taskId: EntityId | null;
  originalTaskId: EntityId | null;
  taskPathSnapshot: string | null;
  originalTaskPathSnapshot: string | null;
  intention: string | null;
  summary: string | null;
  plannedSeconds: number;
  actualSeconds: number;
  status: FocusSessionStatus;
  startedAt: ISODateTimeString;
  endedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface TimerPause {
  id: EntityId;
  sessionId: EntityId;
  reason?: "water" | "message" | "break" | "other" | null;
  startedAt: ISODateTimeString;
  endedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type InterruptionStatus = "open" | "converted" | "dismissed" | "done" | "snoozed";

export interface Interruption {
  id: EntityId;
  sessionId: EntityId | null;
  taskId: EntityId | null;
  text: string;
  status: InterruptionStatus;
  convertedToTaskId?: EntityId | null;
  snoozedUntil?: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface UserSettings {
  id: "local";
  defaultFocusSeconds: number;
  defaultBreakSeconds: number;
  enableNotifications: boolean;
  theme: "light" | "dark" | "system";
  autoStartBreak: boolean;
  autoStartNextFocus: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
