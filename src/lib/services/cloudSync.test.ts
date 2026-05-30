import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createDefaultSettings } from "@/lib/db/defaults";
import type { PomotreeExport } from "@/lib/services/pomotree";
import type { User } from "@supabase/supabase-js";
import {
  assertPomotreeSnapshot,
  createDefaultCloudSyncMetadata,
  loadCloudSyncMetadata,
  mapSnapshotPayload,
  restoreCloudSnapshot,
  saveCloudSyncMetadata,
  uploadCloudSnapshot,
} from "./cloudSync";

const user = { id: "user-1", email: "test@example.com" } as User;

function makeSnapshot(overrides: Partial<PomotreeExport> = {}): PomotreeExport {
  return {
    schemaVersion: 2,
    exportedAt: "2026-05-30T00:00:00.000Z",
    tasks: [],
    labels: [],
    focusSessions: [],
    timerPauses: [],
    interruptions: [],
    userSettings: createDefaultSettings(),
    ...overrides,
  };
}

function makeClient(row: unknown = null, upsertError: Error | null = null) {
  const single = vi.fn(async () => {
    if (upsertError) return { data: null, error: upsertError };
    return { data: row, error: null };
  });
  const selectAfterUpsert = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select: selectAfterUpsert }));
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert }));
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from,
    upsert,
  };
}

const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  } satisfies Storage;
})();

describe("cloud sync snapshot helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage);
    memoryStorage.clear();
  });

  it("maps a Pomotree export into the Supabase snapshot payload", () => {
    const snapshot = makeSnapshot();
    const payload = mapSnapshotPayload({
      userId: "user-1",
      clientId: "client-1",
      snapshot,
      snapshotUpdatedAt: "2026-05-30T01:00:00.000Z",
    });

    expect(payload).toMatchObject({
      user_id: "user-1",
      schema_version: 2,
      snapshot,
      snapshot_updated_at: "2026-05-30T01:00:00.000Z",
      client_id: "client-1",
      updated_at: "2026-05-30T01:00:00.000Z",
    });
  });

  it("rejects unsupported cloud snapshot schema versions", () => {
    expect(() => assertPomotreeSnapshot({ ...makeSnapshot(), schemaVersion: 99 as 2 })).toThrow("Unsupported cloud snapshot schema version");
  });

  it("blocks upload when cloud data is newer than this device has seen", async () => {
    saveCloudSyncMetadata({ ...createDefaultCloudSyncMetadata(), lastSeenCloudUpdatedAt: "2026-05-30T01:00:00.000Z", status: "idle" });
    const cloudRow = {
      user_id: user.id,
      schema_version: 2,
      snapshot: makeSnapshot(),
      snapshot_updated_at: "2026-05-30T02:00:00.000Z",
      client_id: "other-client",
      updated_at: "2026-05-30T02:00:00.000Z",
      created_at: "2026-05-30T02:00:00.000Z",
    };
    const client = makeClient(cloudRow);

    await expect(uploadCloudSnapshot(makeSnapshot(), {}, client as never)).rejects.toThrow("Cloud data changed");
    expect(loadCloudSyncMetadata().status).toBe("conflict");
  });

  it("keeps pending state after an upload failure", async () => {
    saveCloudSyncMetadata({ ...createDefaultCloudSyncMetadata(), status: "idle" });
    const client = makeClient(null, new Error("network down"));

    await expect(uploadCloudSnapshot(makeSnapshot(), { force: true }, client as never)).rejects.toThrow("network down");
  });

  it("restores cloud data through Pomotree import validation", async () => {
    const cloudRow = {
      user_id: user.id,
      schema_version: 2,
      snapshot: makeSnapshot({
        tasks: [{
          id: "cloud-task",
          parentId: null,
          title: "Cloud task",
          status: "todo",
          sortOrder: 0,
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        }],
      }),
      snapshot_updated_at: "2026-05-30T02:00:00.000Z",
      client_id: "other-client",
      updated_at: "2026-05-30T02:00:00.000Z",
      created_at: "2026-05-30T02:00:00.000Z",
    };
    const client = makeClient(cloudRow);

    await restoreCloudSnapshot(client as never);
    expect(await db.tasks.get("cloud-task")).toMatchObject({ title: "Cloud task" });
    expect(loadCloudSyncMetadata().lastSeenCloudUpdatedAt).toBe("2026-05-30T02:00:00.000Z");
  });
});
