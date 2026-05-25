import type { UserSettings } from "@/types/domain";
import { nowIso } from "@/lib/utils/time";

export function createDefaultSettings(): UserSettings {
  const now = nowIso();
  return {
    id: "local",
    defaultFocusSeconds: 25 * 60,
    defaultBreakSeconds: 5 * 60,
    enableNotifications: false,
    theme: "system",
    autoStartBreak: false,
    autoStartNextFocus: false,
    createdAt: now,
    updatedAt: now,
  };
}
