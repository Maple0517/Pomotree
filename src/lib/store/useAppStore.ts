"use client";

import { create } from "zustand";
import type { FocusSession, Interruption, Task, TimerPause, UserSettings } from "@/types/domain";
import { createDefaultSettings } from "@/lib/db/defaults";
import {
  archiveTask,
  changeSessionAttribution,
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
  requestFinish,
  restoreTaskBranch,
  resumeSession,
  saveFinish,
  startFocus,
  updateSettings,
  updateTask,
  type RecoveryNotice,
  type SettingsUpdate,
} from "@/lib/services/pomotree";

interface AppState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  recoveryNotice: RecoveryNotice | null;
  settings: UserSettings;
  tasks: Task[];
  sessions: FocusSession[];
  interruptions: Interruption[];
  pauses: TimerPause[];
  hydrate: () => Promise<void>;
  updateSettings: (input: SettingsUpdate) => Promise<void>;
  createTask: (title: string, parentId?: string | null) => Promise<void>;
  createTaskPath: (path: string) => Promise<void>;
  updateTask: (taskId: string, input: { title?: string; description?: string | null; status?: Task["status"] }) => Promise<void>;
  moveTask: (taskId: string, parentId: string | null) => Promise<void>;
  archiveTask: (taskId: string) => Promise<void>;
  restoreTaskBranch: (taskId: string) => Promise<void>;
  changeSessionAttribution: (sessionId: string, taskId: string | null) => Promise<void>;
  startFocus: (taskId?: string | null, intention?: string | null, plannedSeconds?: number) => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  discardSession: () => Promise<void>;
  requestFinish: () => Promise<void>;
  expireRunningSession: (sessionId: string) => Promise<void>;
  saveFinish: (input: { status: "completed" | "partial"; summary?: string | null; taskId?: string | null; markTaskDone?: boolean }) => Promise<void>;
  createInterruption: (text: string) => Promise<void>;
  dismissInterruption: (interruptionId: string) => Promise<void>;
  markInterruptionDone: (interruptionId: string) => Promise<void>;
  convertInterruptionToTask: (interruptionId: string) => Promise<void>;
  exportJson: () => Promise<string>;
  importJson: (json: string) => Promise<void>;
}

async function refresh(set: (state: Partial<AppState>) => void) {
  const state = await loadAppSnapshot();
  set({ ...state, ready: true, loading: false, error: null });
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  loading: false,
  error: null,
  recoveryNotice: null,
  settings: createDefaultSettings(),
  tasks: [],
  sessions: [],
  interruptions: [],
  pauses: [],
  hydrate: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to initialize", loading: false });
    }
  },
  updateSettings: async (input) => {
    try {
      await updateSettings(input);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update settings" });
      throw error;
    }
  },
  createTask: async (title, parentId = null) => {
    try {
      await createTask(title, parentId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to create task" });
      throw error;
    }
  },
  createTaskPath: async (path) => {
    try {
      await createTaskPath(path);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to create task path" });
      throw error;
    }
  },
  updateTask: async (taskId, input) => {
    try {
      await updateTask(taskId, input);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update task" });
      throw error;
    }
  },
  moveTask: async (taskId, parentId) => {
    try {
      await moveTask(taskId, parentId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to move task" });
      throw error;
    }
  },
  archiveTask: async (taskId) => {
    try {
      await archiveTask(taskId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to archive task" });
      throw error;
    }
  },
  restoreTaskBranch: async (taskId) => {
    try {
      await restoreTaskBranch(taskId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to restore archived branch" });
      throw error;
    }
  },
  changeSessionAttribution: async (sessionId, taskId) => {
    try {
      await changeSessionAttribution(sessionId, taskId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update session attribution" });
      throw error;
    }
  },
  startFocus: async (taskId = null, intention = null, plannedSeconds) => {
    try {
      await startFocus(taskId, intention, plannedSeconds);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to start focus" });
      throw error;
    }
  },
  pauseSession: async () => {
    try {
      await pauseSession();
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to pause session" });
      throw error;
    }
  },
  resumeSession: async () => {
    try {
      await resumeSession();
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to resume session" });
      throw error;
    }
  },
  discardSession: async () => {
    try {
      await discardSession();
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to discard session" });
      throw error;
    }
  },
  requestFinish: async () => {
    try {
      await requestFinish();
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to finish session" });
      throw error;
    }
  },
  expireRunningSession: async (sessionId) => {
    try {
      await expireRunningSession(sessionId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to expire session" });
      throw error;
    }
  },
  saveFinish: async (input) => {
    try {
      await saveFinish(input);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to save session" });
      throw error;
    }
  },
  exportJson: async () => {
    const data = await exportJson();
    return JSON.stringify(data, null, 2);
  },
  importJson: async (json) => {
    try {
      const state = await importJson(json);
      set({ ...state, ready: true, loading: false, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to import JSON" });
      throw error;
    }
  },
  createInterruption: async (text) => {
    try {
      await createInterruption(text);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to create interruption" });
      throw error;
    }
  },
  dismissInterruption: async (interruptionId) => {
    try {
      await dismissInterruption(interruptionId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to dismiss interruption" });
      throw error;
    }
  },
  markInterruptionDone: async (interruptionId) => {
    try {
      await markInterruptionDone(interruptionId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to complete interruption" });
      throw error;
    }
  },
  convertInterruptionToTask: async (interruptionId) => {
    try {
      await convertInterruptionToTask(interruptionId);
      await refresh(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to convert interruption" });
      throw error;
    }
  },
}));
