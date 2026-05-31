import { expect, test } from "@playwright/test";

type Page = Parameters<Parameters<typeof test>[1]>[0]["page"];

function todayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function seedTimelineData(page: Page) {
  const dbName = await page.evaluate(() => window.localStorage.getItem("pomotree-db-name"));
  if (!dbName) throw new Error("Missing e2e database name");

  await page.evaluate(
    async ({ databaseName, timestamps }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = window.indexedDB.open(databaseName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["tasks", "focusSessions", "timerPauses"], "readwrite");
        const tasks = tx.objectStore("tasks");
        const sessions = tx.objectStore("focusSessions");
        const pauses = tx.objectStore("timerPauses");

        tasks.put({
          id: "task-deep-work",
          parentId: null,
          title: "Deep work",
          status: "todo",
          sortOrder: 0,
          createdAt: timestamps.createdAt,
          updatedAt: timestamps.createdAt,
        });
        tasks.put({
          id: "task-quick-note",
          parentId: null,
          title: "Quick note",
          status: "todo",
          sortOrder: 1,
          createdAt: timestamps.createdAt,
          updatedAt: timestamps.createdAt,
        });

        sessions.put({
          id: "session-25m",
          taskId: "task-deep-work",
          originalTaskId: "task-deep-work",
          taskPathSnapshot: "Deep work",
          originalTaskPathSnapshot: "Deep work",
          intention: null,
          summary: "Longer focused block",
          plannedSeconds: 1500,
          actualSeconds: 1500,
          status: "completed",
          startedAt: timestamps.deepStart,
          endedAt: timestamps.deepEnd,
          createdAt: timestamps.deepStart,
          updatedAt: timestamps.deepEnd,
        });
        sessions.put({
          id: "session-3m",
          taskId: "task-quick-note",
          originalTaskId: "task-quick-note",
          taskPathSnapshot: "Quick note",
          originalTaskPathSnapshot: "Quick note",
          intention: null,
          summary: "Short focused block",
          plannedSeconds: 180,
          actualSeconds: 180,
          status: "completed",
          startedAt: timestamps.quickStart,
          endedAt: timestamps.quickEnd,
          createdAt: timestamps.quickStart,
          updatedAt: timestamps.quickEnd,
        });
        pauses.put({
          id: "pause-25m",
          sessionId: "session-25m",
          reason: "break",
          startedAt: timestamps.pauseStart,
          endedAt: timestamps.pauseEnd,
          createdAt: timestamps.pauseStart,
          updatedAt: timestamps.pauseEnd,
        });

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    {
      databaseName: dbName,
      timestamps: {
        createdAt: todayAt(8, 0),
        deepStart: todayAt(9, 0),
        pauseStart: todayAt(9, 10),
        pauseEnd: todayAt(9, 15),
        deepEnd: todayAt(9, 30),
        quickStart: todayAt(10, 0),
        quickEnd: todayAt(10, 3),
      },
    },
  );
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
  }, `pomotree-e2e-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.title.replace(/[^a-z0-9]/gi, "-")}`);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Local-first MVP").waitFor();
});

test("daily timeline uses proportional rail segments and selectable detail", async ({ page }) => {
  await seedTimelineData(page);
  await page.reload({ waitUntil: "networkidle" });

  const timeline = page.getByRole("region", { name: "Daily focus timeline" });
  await expect(timeline.getByRole("button", { name: "Full day" })).toBeVisible();
  await expect(timeline.getByText("Deep work").first()).toBeVisible();
  await expect(timeline.getByText("Quick note").first()).toBeVisible();

  const rail = timeline.getByLabel("Timeline rail");
  const shortSegment = rail.locator('button[aria-label*="Quick note"]').first();
  const longVisual = rail.getByTestId("timeline-focus-segment-session-25m").first();
  const shortVisual = rail.getByTestId("timeline-focus-segment-session-3m").first();
  const longBox = await longVisual.boundingBox();
  const shortBox = await shortVisual.boundingBox();
  expect(longBox?.height ?? 0).toBeGreaterThan((shortBox?.height ?? 0) * 1.8);

  await shortSegment.click();
  await expect(timeline.locator("aside").getByText("Quick note")).toBeVisible();
  await expect(timeline.locator("aside").getByText("3m")).toBeVisible();

  await timeline.getByRole("button", { name: "Full day" }).click();
  await expect(timeline.getByRole("button", { name: "Active hours" })).toBeVisible();
});

test("daily timeline date navigation handles empty days and mobile width", async ({ page }) => {
  await seedTimelineData(page);
  await page.reload({ waitUntil: "networkidle" });

  const timeline = page.getByRole("region", { name: "Daily focus timeline" });
  await timeline.getByRole("button", { name: "Previous day" }).click();
  await expect(timeline.getByText("No completed focus sessions on this day.").first()).toBeVisible();
  await expect(timeline.getByText("0m").first()).toBeVisible();

  await timeline.getByRole("button", { name: "Today" }).click();
  await expect(timeline.getByText("Deep work").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
