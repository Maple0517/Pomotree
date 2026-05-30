import Dexie, { type Table } from "dexie";
import type { FocusSession, Interruption, Task, TaskLabel, TimerPause, UserSettings } from "@/types/domain";
import { createDefaultSettings } from "./defaults";
import { dexieSchema, dexieSchemaV2 } from "./schema";
import { validateUserSettingsRecord } from "@/lib/validation/domain";

export class StorageUnavailableError extends Error {
  constructor() {
    super("Local storage is unavailable. Enable IndexedDB/browser storage to use Pomotree on this device.");
    this.name = "StorageUnavailableError";
  }
}

export class PomotreeDatabase extends Dexie {
  tasks!: Table<Task, string>;
  taskLabels!: Table<TaskLabel, string>;
  focusSessions!: Table<FocusSession, string>;
  timerPauses!: Table<TimerPause, string>;
  interruptions!: Table<Interruption, string>;
  userSettings!: Table<UserSettings, "local">;

  constructor(name = "pomotree") {
    super(name);
    this.version(1).stores(dexieSchema);
    this.version(2).stores(dexieSchemaV2).upgrade(async (transaction) => {
      const tasks = transaction.table<Task, string>("tasks");
      const existingTasks = await tasks.toArray();
      await tasks.bulkPut(existingTasks.map((task) => ({ ...task, labelIds: task.labelIds ?? [] })));
    });
  }
}

function getDatabaseName() {
  if (typeof window === "undefined") return "pomotree";
  return window.localStorage.getItem("pomotree-db-name") ?? "pomotree";
}

export const db = new PomotreeDatabase(getDatabaseName());

export function assertStorageAvailable() {
  if (typeof window !== "undefined" && !window.indexedDB) {
    throw new StorageUnavailableError();
  }
}

export async function ensureDefaultSettings() {
  assertStorageAvailable();
  const existing = await db.userSettings.get("local");
  if (!existing) {
    const settings = createDefaultSettings();
    validateUserSettingsRecord(settings);
    await db.userSettings.put(settings);
  }
}
