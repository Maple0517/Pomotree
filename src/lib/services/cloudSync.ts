import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { importJson, type PomotreeExport } from "@/lib/services/pomotree";
import { nowIso } from "@/lib/utils/time";

export type CloudSyncStatus = "signed_out" | "idle" | "queued" | "syncing" | "conflict" | "error";

export type CloudSyncMetadata = {
  clientId: string;
  email: string | null;
  lastSeenCloudUpdatedAt: string | null;
  lastSuccessfulBackupAt: string | null;
  pending: boolean;
  error: string | null;
  status: CloudSyncStatus;
  firstLoginNeedsUpload: boolean;
};

export type CloudSyncSnapshotRow = {
  user_id: string;
  schema_version: number;
  snapshot: PomotreeExport;
  snapshot_updated_at: string;
  client_id: string;
  updated_at: string;
  created_at: string;
};

export type CloudSyncSnapshotInput = {
  userId: string;
  snapshot: PomotreeExport;
  clientId: string;
  snapshotUpdatedAt?: string;
};

const METADATA_STORAGE_KEY = "pomotree-cloud-sync-metadata";
const CLIENT_ID_STORAGE_KEY = "pomotree-cloud-sync-client-id";
const SUPABASE_MISSING_MESSAGE = "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

let supabaseClient: SupabaseClient | null = null;

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  return null;
}

function isBrowser() {
  return getLocalStorage() !== null;
}

function createFallbackClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getCloudSyncClientId() {
  if (!isBrowser()) return "server";
  const existing = getLocalStorage()?.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const clientId = createFallbackClientId();
  getLocalStorage()?.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  return clientId;
}

export function createDefaultCloudSyncMetadata(): CloudSyncMetadata {
  return {
    clientId: getCloudSyncClientId(),
    email: null,
    lastSeenCloudUpdatedAt: null,
    lastSuccessfulBackupAt: null,
    pending: false,
    error: null,
    status: "signed_out",
    firstLoginNeedsUpload: false,
  };
}

function normalizeMetadata(value: unknown): CloudSyncMetadata {
  if (!value || typeof value !== "object") return createDefaultCloudSyncMetadata();
  const record = value as Partial<CloudSyncMetadata>;
  const fallback = createDefaultCloudSyncMetadata();
  const status: CloudSyncStatus = ["signed_out", "idle", "queued", "syncing", "conflict", "error"].includes(record.status ?? "")
    ? (record.status as CloudSyncStatus)
    : fallback.status;

  return {
    clientId: typeof record.clientId === "string" && record.clientId ? record.clientId : fallback.clientId,
    email: typeof record.email === "string" ? record.email : null,
    lastSeenCloudUpdatedAt: typeof record.lastSeenCloudUpdatedAt === "string" ? record.lastSeenCloudUpdatedAt : null,
    lastSuccessfulBackupAt: typeof record.lastSuccessfulBackupAt === "string" ? record.lastSuccessfulBackupAt : null,
    pending: Boolean(record.pending),
    error: typeof record.error === "string" ? record.error : null,
    status,
    firstLoginNeedsUpload: Boolean(record.firstLoginNeedsUpload),
  };
}

export function loadCloudSyncMetadata(): CloudSyncMetadata {
  if (!isBrowser()) return createDefaultCloudSyncMetadata();
  try {
    return normalizeMetadata(JSON.parse(getLocalStorage()?.getItem(METADATA_STORAGE_KEY) ?? "null"));
  } catch {
    return createDefaultCloudSyncMetadata();
  }
}

export function saveCloudSyncMetadata(input: CloudSyncMetadata): CloudSyncMetadata {
  const metadata = normalizeMetadata(input);
  if (isBrowser()) {
    getLocalStorage()?.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));
    getLocalStorage()?.setItem(CLIENT_ID_STORAGE_KEY, metadata.clientId);
  }
  return metadata;
}

export function updateCloudSyncMetadata(patch: Partial<CloudSyncMetadata>): CloudSyncMetadata {
  return saveCloudSyncMetadata({ ...loadCloudSyncMetadata(), ...patch });
}

export function resetCloudSyncMetadataAfterSignOut(): CloudSyncMetadata {
  return saveCloudSyncMetadata({
    ...loadCloudSyncMetadata(),
    email: null,
    lastSeenCloudUpdatedAt: null,
    lastSuccessfulBackupAt: null,
    pending: false,
    error: null,
    status: "signed_out",
    firstLoginNeedsUpload: false,
  });
}

export function getSupabaseBrowserClient() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error(SUPABASE_MISSING_MESSAGE);

  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: "pomotree-supabase-auth",
    },
  });
  return supabaseClient;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function getCloudSyncUser(client = getSupabaseBrowserClient()): Promise<User | null> {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function sendCloudSyncOtp(email: string, client = getSupabaseBrowserClient()) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required");

  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
  updateCloudSyncMetadata({ email: normalizedEmail, error: null });
}

export async function verifyCloudSyncOtp(email: string, token: string, client = getSupabaseBrowserClient()) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.trim();
  if (!normalizedEmail) throw new Error("Email is required");
  if (!normalizedToken) throw new Error("Verification code is required");

  const { data, error } = await client.auth.verifyOtp({ email: normalizedEmail, token: normalizedToken, type: "email" });
  if (error) throw error;
  const user = data.user ?? (await getCloudSyncUser(client));
  updateCloudSyncMetadata({
    email: user?.email ?? normalizedEmail,
    status: "idle",
    error: null,
  });
  return user;
}

export async function signOutCloudSync(client = getSupabaseBrowserClient()) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
  return resetCloudSyncMetadataAfterSignOut();
}

export function snapshotHasLocalData(snapshot: PomotreeExport) {
  return snapshot.tasks.length > 0 || snapshot.focusSessions.length > 0 || snapshot.timerPauses.length > 0 || snapshot.interruptions.length > 0;
}

export function mapSnapshotPayload(input: CloudSyncSnapshotInput) {
  const snapshotUpdatedAt = input.snapshotUpdatedAt ?? nowIso();
  return {
    user_id: input.userId,
    schema_version: input.snapshot.schemaVersion,
    snapshot: input.snapshot,
    snapshot_updated_at: snapshotUpdatedAt,
    client_id: input.clientId,
    updated_at: snapshotUpdatedAt,
  };
}

export function assertPomotreeSnapshot(value: PomotreeExport) {
  if (value.schemaVersion !== 1) throw new Error("Unsupported cloud snapshot schema version");
  if (!Array.isArray(value.tasks)) throw new Error("Cloud snapshot is missing tasks");
  if (!Array.isArray(value.focusSessions)) throw new Error("Cloud snapshot is missing focusSessions");
  if (!Array.isArray(value.timerPauses)) throw new Error("Cloud snapshot is missing timerPauses");
  if (!Array.isArray(value.interruptions)) throw new Error("Cloud snapshot is missing interruptions");
  if (!value.userSettings || typeof value.userSettings !== "object") throw new Error("Cloud snapshot is missing userSettings");
}

export async function fetchCloudSnapshot(client = getSupabaseBrowserClient()) {
  const user = await getCloudSyncUser(client);
  if (!user) throw new Error("Sign in before using cloud sync");

  const { data, error } = await client
    .from("pomotree_snapshots")
    .select("user_id,schema_version,snapshot,snapshot_updated_at,client_id,updated_at,created_at")
    .eq("user_id", user.id)
    .maybeSingle<CloudSyncSnapshotRow>();

  if (error) throw error;
  if (data?.snapshot) assertPomotreeSnapshot(data.snapshot);
  return data;
}

export async function uploadCloudSnapshot(snapshot: PomotreeExport, options: { force?: boolean } = {}, client = getSupabaseBrowserClient()) {
  const user = await getCloudSyncUser(client);
  if (!user) throw new Error("Sign in before backing up");
  const metadata = loadCloudSyncMetadata();

  if (!options.force && metadata.status === "conflict") {
    throw new Error(metadata.error ?? "Cloud data changed. Restore cloud data or overwrite it with this device.");
  }

  const cloud = await fetchCloudSnapshot(client);

  if (!options.force && cloud?.snapshot_updated_at && metadata.lastSeenCloudUpdatedAt && cloud.snapshot_updated_at > metadata.lastSeenCloudUpdatedAt) {
    updateCloudSyncMetadata({
      status: "conflict",
      pending: true,
      error: "Cloud data changed on another device. Restore cloud data or overwrite it with this device.",
    });
    throw new Error("Cloud data changed on another device. Restore cloud data or overwrite it with this device.");
  }

  if (!options.force && cloud?.snapshot_updated_at && !metadata.lastSeenCloudUpdatedAt) {
    updateCloudSyncMetadata({
      lastSeenCloudUpdatedAt: cloud.snapshot_updated_at,
      status: "conflict",
      pending: true,
      error: "Cloud data already exists. Restore cloud data or overwrite it with this device.",
    });
    throw new Error("Cloud data already exists. Restore cloud data or overwrite it with this device.");
  }

  const payload = mapSnapshotPayload({ userId: user.id, snapshot, clientId: metadata.clientId });
  const { data, error } = await client
    .from("pomotree_snapshots")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id,schema_version,snapshot,snapshot_updated_at,client_id,updated_at,created_at")
    .single<CloudSyncSnapshotRow>();

  if (error) throw error;
  return data;
}

export async function restoreCloudSnapshot(client = getSupabaseBrowserClient()) {
  const cloud = await fetchCloudSnapshot(client);
  if (!cloud) throw new Error("No cloud backup found");
  assertPomotreeSnapshot(cloud.snapshot);
  const state = await importJson(cloud.snapshot);
  updateCloudSyncMetadata({
    lastSeenCloudUpdatedAt: cloud.snapshot_updated_at,
    lastSuccessfulBackupAt: cloud.snapshot_updated_at,
    pending: false,
    error: null,
    status: "idle",
    firstLoginNeedsUpload: false,
  });
  return { cloud, state };
}

export function subscribeToCloudAuthChanges(onChange: () => void) {
  if (!isSupabaseConfigured()) return () => {};
  const client = getSupabaseBrowserClient();
  const { data } = client.auth.onAuthStateChange(() => {
    onChange();
  });
  return () => data.subscription.unsubscribe();
}

export { SUPABASE_MISSING_MESSAGE };
