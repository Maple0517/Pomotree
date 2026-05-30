"use client";

import { create } from "zustand";
import type { FocusSession, Interruption, Task, TimerPause, UserSettings } from "@/types/domain";
import {
  fetchCloudSnapshot,
  getCloudSyncUser,
  isSupabaseConfigured,
  loadCloudSyncMetadata,
  resetCloudSyncMetadataAfterSignOut,
  restoreCloudSnapshot,
  signInCloudSyncWithPassword,
  signOutCloudSync,
  signUpCloudSyncWithPassword,
  snapshotHasLocalData,
  subscribeToCloudAuthChanges,
  updateCloudSyncMetadata,
  uploadCloudSnapshot,
  type CloudSyncMetadata,
} from "@/lib/services/cloudSync";
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
  cloudSync: CloudSyncMetadata;
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
  signInCloudSync: (email: string, password: string) => Promise<void>;
  signUpCloudSync: (email: string, password: string) => Promise<void>;
  signOutCloudSync: () => Promise<void>;
  refreshCloudSync: () => Promise<void>;
  backupToCloud: (options?: { force?: boolean }) => Promise<void>;
  restoreFromCloud: () => Promise<void>;
}

async function refresh(set: (state: Partial<AppState>) => void) {
  const state = await loadAppSnapshot();
  set({ ...state, ready: true, loading: false, error: null, cloudSync: loadCloudSyncMetadata() });
}

async function refreshAndBroadcast(set: (state: Partial<AppState>) => void) {
  await refresh(set);
  broadcastAppStateChange();
}

const APP_STATE_CHANNEL = "pomotree-app-state";
const APP_STATE_CLIENT_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type AppStateChangeMessage = {
  source: string;
  changedAt: number;
};

let stateChannel: BroadcastChannel | null = null;
let subscribedToStateChanges = false;

function getStateChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  stateChannel ??= new BroadcastChannel(APP_STATE_CHANNEL);
  return stateChannel;
}

function broadcastAppStateChange() {
  if (typeof window === "undefined") return;

  const message: AppStateChangeMessage = { source: APP_STATE_CLIENT_ID, changedAt: Date.now() };
  getStateChannel()?.postMessage(message);

  try {
    window.localStorage.setItem(APP_STATE_CHANNEL, JSON.stringify(message));
  } catch {
    // Storage events are only a fallback; BroadcastChannel is preferred when available.
  }
}

function subscribeToAppStateChanges(onChange: () => void) {
  if (typeof window === "undefined" || subscribedToStateChanges) return;
  subscribedToStateChanges = true;

  const handleMessage = (message: AppStateChangeMessage | null | undefined) => {
    if (!message || message.source === APP_STATE_CLIENT_ID) return;
    onChange();
  };

  const channel = getStateChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent<AppStateChangeMessage>) => {
      handleMessage(event.data);
    };
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== APP_STATE_CHANNEL || !event.newValue) return;
    try {
      handleMessage(JSON.parse(event.newValue) as AppStateChangeMessage);
    } catch {
      // Ignore malformed cross-window sync payloads.
    }
  });

  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onChange();
  });
}


let backupTimer: ReturnType<typeof setTimeout> | null = null;
let backupInFlight = false;

function setCloudSyncState(set: (state: Partial<AppState>) => void, patch: Partial<CloudSyncMetadata>) {
  const metadata = updateCloudSyncMetadata(patch);
  set({ cloudSync: metadata });
  return metadata;
}

async function refreshCloudSyncState(set: (state: Partial<AppState>) => void) {
  if (!isSupabaseConfigured()) {
    set({ cloudSync: loadCloudSyncMetadata() });
    return;
  }

  const user = await getCloudSyncUser();
  if (!user) {
    set({ cloudSync: resetCloudSyncMetadataAfterSignOut() });
    return;
  }

  const snapshot = await exportJson();
  const cloud = await fetchCloudSnapshot();
  setCloudSyncState(set, {
    email: user.email ?? loadCloudSyncMetadata().email,
    status: cloud && snapshotHasLocalData(snapshot) && !loadCloudSyncMetadata().lastSeenCloudUpdatedAt ? "conflict" : loadCloudSyncMetadata().status === "signed_out" ? "idle" : loadCloudSyncMetadata().status,
    lastSeenCloudUpdatedAt: loadCloudSyncMetadata().lastSeenCloudUpdatedAt ?? cloud?.snapshot_updated_at ?? null,
    firstLoginNeedsUpload: !cloud && snapshotHasLocalData(snapshot),
    error: cloud && snapshotHasLocalData(snapshot) && !loadCloudSyncMetadata().lastSeenCloudUpdatedAt ? "Cloud data already exists. Restore cloud data or overwrite it with this device." : loadCloudSyncMetadata().error,
  });
}

async function runCloudBackup(set: (state: Partial<AppState>) => void, options: { force?: boolean } = {}) {
  if (!isSupabaseConfigured()) return;
  const user = await getCloudSyncUser();
  if (!user) {
    set({ cloudSync: resetCloudSyncMetadataAfterSignOut() });
    return;
  }

  if (backupInFlight) {
    setCloudSyncState(set, { pending: true, status: "queued" });
    return;
  }

  backupInFlight = true;
  setCloudSyncState(set, { pending: false, status: "syncing", error: null, email: user.email ?? loadCloudSyncMetadata().email });
  try {
    const snapshot = await exportJson();
    const row = await uploadCloudSnapshot(snapshot, options);
    setCloudSyncState(set, {
      lastSeenCloudUpdatedAt: row.snapshot_updated_at,
      lastSuccessfulBackupAt: row.snapshot_updated_at,
      pending: false,
      status: "idle",
      error: null,
      firstLoginNeedsUpload: false,
    });
  } catch (error) {
    const metadata = loadCloudSyncMetadata();
    setCloudSyncState(set, {
      pending: true,
      status: metadata.status === "conflict" ? "conflict" : "error",
      error: error instanceof Error ? error.message : "Cloud backup failed",
    });
  } finally {
    backupInFlight = false;
  }
}

function queueCloudBackup(set: (state: Partial<AppState>) => void) {
  if (!isSupabaseConfigured()) return;
  const metadata = loadCloudSyncMetadata();
  if (metadata.status === "signed_out" || metadata.status === "conflict") return;
  setCloudSyncState(set, { pending: true, status: "queued" });
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    void runCloudBackup(set);
  }, 600);
}

async function mutateAndRefresh(set: (state: Partial<AppState>) => void, mutation: () => Promise<unknown>) {
  await mutation();
  await refreshAndBroadcast(set);
  queueCloudBackup(set);
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  loading: false,
  error: null,
  recoveryNotice: null,
  cloudSync: loadCloudSyncMetadata(),
  settings: createDefaultSettings(),
  tasks: [],
  sessions: [],
  interruptions: [],
  pauses: [],
  hydrate: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      await refreshAndBroadcast(set);
      void refreshCloudSyncState(set);
      queueCloudBackup(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to initialize", loading: false });
    }
  },
  updateSettings: async (input) => {
    try {
      await mutateAndRefresh(set, () => updateSettings(input));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update settings" });
      throw error;
    }
  },
  createTask: async (title, parentId = null) => {
    try {
      await mutateAndRefresh(set, () => createTask(title, parentId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to create task" });
      throw error;
    }
  },
  createTaskPath: async (path) => {
    try {
      await mutateAndRefresh(set, () => createTaskPath(path));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to create task path" });
      throw error;
    }
  },
  updateTask: async (taskId, input) => {
    try {
      await mutateAndRefresh(set, () => updateTask(taskId, input));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update task" });
      throw error;
    }
  },
  moveTask: async (taskId, parentId) => {
    try {
      await mutateAndRefresh(set, () => moveTask(taskId, parentId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to move task" });
      throw error;
    }
  },
  archiveTask: async (taskId) => {
    try {
      await mutateAndRefresh(set, () => archiveTask(taskId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to archive task" });
      throw error;
    }
  },
  restoreTaskBranch: async (taskId) => {
    try {
      await mutateAndRefresh(set, () => restoreTaskBranch(taskId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to restore archived branch" });
      throw error;
    }
  },
  changeSessionAttribution: async (sessionId, taskId) => {
    try {
      await mutateAndRefresh(set, () => changeSessionAttribution(sessionId, taskId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update session attribution" });
      throw error;
    }
  },
  startFocus: async (taskId = null, intention = null, plannedSeconds) => {
    try {
      await mutateAndRefresh(set, () => startFocus(taskId, intention, plannedSeconds));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to start focus" });
      throw error;
    }
  },
  pauseSession: async () => {
    try {
      await mutateAndRefresh(set, pauseSession);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to pause session" });
      throw error;
    }
  },
  resumeSession: async () => {
    try {
      await mutateAndRefresh(set, resumeSession);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to resume session" });
      throw error;
    }
  },
  discardSession: async () => {
    try {
      await mutateAndRefresh(set, discardSession);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to discard session" });
      throw error;
    }
  },
  requestFinish: async () => {
    try {
      await mutateAndRefresh(set, requestFinish);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to finish session" });
      throw error;
    }
  },
  expireRunningSession: async (sessionId) => {
    try {
      await mutateAndRefresh(set, () => expireRunningSession(sessionId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to expire session" });
      throw error;
    }
  },
  saveFinish: async (input) => {
    try {
      await mutateAndRefresh(set, () => saveFinish(input));
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
      set({ ...state, ready: true, loading: false, error: null, cloudSync: loadCloudSyncMetadata() });
      broadcastAppStateChange();
      queueCloudBackup(set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to import JSON" });
      throw error;
    }
  },
  createInterruption: async (text) => {
    try {
      await mutateAndRefresh(set, () => createInterruption(text));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to create interruption" });
      throw error;
    }
  },
  dismissInterruption: async (interruptionId) => {
    try {
      await mutateAndRefresh(set, () => dismissInterruption(interruptionId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to dismiss interruption" });
      throw error;
    }
  },
  markInterruptionDone: async (interruptionId) => {
    try {
      await mutateAndRefresh(set, () => markInterruptionDone(interruptionId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to complete interruption" });
      throw error;
    }
  },
  convertInterruptionToTask: async (interruptionId) => {
    try {
      await mutateAndRefresh(set, () => convertInterruptionToTask(interruptionId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to convert interruption" });
      throw error;
    }
  },
  signInCloudSync: async (email, password) => {
    try {
      await signInCloudSyncWithPassword(email, password);
      await refreshCloudSyncState(set);
      set({ cloudSync: loadCloudSyncMetadata(), error: null });
    } catch (error) {
      setCloudSyncState(set, { status: "signed_out", error: error instanceof Error ? error.message : "Failed to sign in" });
      throw error;
    }
  },
  signUpCloudSync: async (email, password) => {
    try {
      await signUpCloudSyncWithPassword(email, password);
      const user = await getCloudSyncUser();
      if (user) await refreshCloudSyncState(set);
      set({ cloudSync: loadCloudSyncMetadata(), error: null });
    } catch (error) {
      setCloudSyncState(set, { status: "signed_out", error: error instanceof Error ? error.message : "Failed to create account" });
      throw error;
    }
  },
  signOutCloudSync: async () => {
    try {
      await signOutCloudSync();
      set({ cloudSync: loadCloudSyncMetadata(), error: null });
    } catch (error) {
      setCloudSyncState(set, { status: "error", error: error instanceof Error ? error.message : "Failed to sign out" });
      throw error;
    }
  },
  refreshCloudSync: async () => {
    try {
      await refreshCloudSyncState(set);
    } catch (error) {
      setCloudSyncState(set, { status: "error", error: error instanceof Error ? error.message : "Failed to refresh cloud sync" });
      throw error;
    }
  },
  backupToCloud: async (options = {}) => {
    await runCloudBackup(set, options);
    const metadata = loadCloudSyncMetadata();
    if (metadata.status === "error" || metadata.status === "conflict") {
      throw new Error(metadata.error ?? "Cloud backup failed");
    }
  },
  restoreFromCloud: async () => {
    try {
      const { state } = await restoreCloudSnapshot();
      set({ ...state, ready: true, loading: false, error: null, cloudSync: loadCloudSyncMetadata() });
      broadcastAppStateChange();
    } catch (error) {
      setCloudSyncState(set, { status: "error", error: error instanceof Error ? error.message : "Failed to restore cloud backup" });
      throw error;
    }
  },
}));


subscribeToAppStateChanges(() => {
  if (useAppStore.getState().loading) return;
  void refresh(useAppStore.setState);
});

subscribeToCloudAuthChanges(() => {
  void useAppStore.getState().refreshCloudSync();
});
