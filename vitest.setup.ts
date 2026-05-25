import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";
import { db } from "@/lib/db";

afterEach(async () => {
  vi.restoreAllMocks();
  await db.tasks.clear();
  await db.focusSessions.clear();
  await db.timerPauses.clear();
  await db.interruptions.clear();
  await db.userSettings.clear();
});
