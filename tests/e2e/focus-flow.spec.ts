import { expect, test } from "@playwright/test";

async function seedExpiredRunningSession(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  const dbName = await page.evaluate(() => window.localStorage.getItem("pomotree-db-name"));
  if (!dbName) throw new Error("Missing e2e database name");

  const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await page.evaluate(
    async ({ databaseName, startedAtIso }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = window.indexedDB.open(databaseName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("focusSessions", "readwrite");
        tx.objectStore("focusSessions").put({
          id: "expired-session",
          taskId: null,
          originalTaskId: null,
          taskPathSnapshot: null,
          originalTaskPathSnapshot: null,
          intention: "Expired recovery session",
          summary: null,
          plannedSeconds: 1,
          actualSeconds: 0,
          status: "running",
          startedAt: startedAtIso,
          endedAt: null,
          createdAt: startedAtIso,
          updatedAt: startedAtIso,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    { databaseName: dbName, startedAtIso: startedAt },
  );
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
  }, `pomotree-e2e-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.title.replace(/[^a-z0-9]/gi, "-")}`);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Local-first MVP").waitFor();
});

test("start to finish and export", async ({ page }) => {
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Product / Draft product loop");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Product$/ })).toBeVisible();
  await expect(page.locator("span", { hasText: /^↳ Draft product loop$/ })).toBeVisible();

  await page.getByLabel("Actual attribution").selectOption({ label: "— Draft product loop" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByText("running")).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("finishing", { exact: true })).toBeVisible();
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Finished e2e validation");
  await page.getByRole("button", { name: "Save completed" }).click();
  await expect(page.getByText("Idle")).toBeVisible();

  await page.getByPlaceholder("Capture an intention, a summary, or the next follow-up task...").fill("Follow up on recovery");
  await page.getByRole("button", { name: "Save note" }).click();
  const todayCards = page.locator('section:has-text("Today") div.rounded-2xl');
  await expect(todayCards.filter({ hasText: "Completed1" })).toBeVisible();
  await expect(todayCards.filter({ hasText: "Interruptions1" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("pomotree-export-");
});

test("refresh restores a running session", async ({ page }) => {
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Recovery task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByText("running")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("running")).toBeVisible();
});

test("reopen expired running session enters finishing", async ({ page }) => {
  await seedExpiredRunningSession(page);
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.getByText("ready to finish")).toBeVisible();
  await expect(page.getByText("finishing", { exact: true })).toBeVisible();
  await expect(page.getByText("Finish this focus session")).toBeVisible();
});

test("finish flow supports attribution correction", async ({ page }) => {
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Planned task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Planned task$/ })).toBeVisible();
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Actual task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Actual task$/ })).toBeVisible();

  await page.getByLabel("Actual attribution").selectOption({ label: "Planned task" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByLabel("Actual attribution").selectOption({ label: "Actual task" });
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Corrected the attribution");
  await page.getByRole("button", { name: "Save completed" }).click();

  const recentSession = page.getByLabel("Recent session: Actual task");
  await expect(recentSession).toBeVisible();
  await expect(recentSession.getByText("Corrected the attribution")).toBeVisible();
});


test("saved session attribution can be corrected from recent history", async ({ page }) => {
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Original history task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Original history task$/ })).toBeVisible();
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Corrected history task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Corrected history task$/ })).toBeVisible();

  await page.getByLabel("Actual attribution").selectOption({ label: "Original history task" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Needs later correction");
  await page.getByRole("button", { name: "Save completed" }).click();

  const originalSession = page.getByLabel("Recent session: Original history task");
  await expect(originalSession).toBeVisible();
  await originalSession.getByRole("button", { name: "Correct attribution" }).click();
  await page.getByLabel("Correct attribution for Original history task").selectOption({ label: "Corrected history task" });
  await page.getByLabel("Correct attribution for Original history task").locator("..").getByRole("button", { name: "Save" }).click();

  await expect(page.getByLabel("Recent session: Corrected history task")).toBeVisible();
  await expect(page.getByLabel("Recent session: Original history task")).toHaveCount(0);
});

test("interruption can be converted into a task", async ({ page }) => {
  await page.getByPlaceholder("Capture an intention, a summary, or the next follow-up task...").fill("Write follow-up task");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Write follow-up task")).toBeVisible();

  await page.getByRole("button", { name: "Convert to task" }).click();

  await expect(page.locator("span", { hasText: /^Write follow-up task$/ })).toBeVisible();
  await expect(page.getByText("No open interruptions.")).toBeVisible();
  const todayCards = page.locator('section:has-text("Today") div.rounded-2xl');
  await expect(todayCards.filter({ hasText: "Interruptions0" })).toBeVisible();
});

test("task tree supports inline rename and move", async ({ page }) => {
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Project");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Project$/ })).toBeVisible();
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Loose task");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.locator("span", { hasText: /^Loose task$/ })).toBeVisible();

  await page.locator("div", { hasText: /^Loose task/ }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit title for Loose task").fill("Moved task");
  await page.getByLabel("Move Loose task").selectOption({ label: "Project" });
  await page.getByRole("button", { name: "Save task" }).click();

  await expect(page.locator("span", { hasText: /^↳ Moved task$/ })).toBeVisible();
  await expect(page.locator("span", { hasText: /^Loose task$/ })).toHaveCount(0);
});

test("JSON import restores exported data", async ({ page }) => {
  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Backup task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("span", { hasText: /^Backup task$/ })).toBeVisible();

  const exportJson = await page.evaluate(() => {
    const task = {
      id: "restored-task",
      parentId: null,
      title: "Restored task",
      status: "todo",
      sortOrder: 0,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    const settings = {
      id: "local",
      defaultFocusSeconds: 3000,
      defaultBreakSeconds: 300,
      enableNotifications: false,
      theme: "dark",
      autoStartBreak: false,
      autoStartNextFocus: false,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-05-26T00:00:00.000Z",
      tasks: [task],
      focusSessions: [],
      timerPauses: [],
      interruptions: [],
      userSettings: settings,
    });
  });

  await page.getByRole("button", { name: "Import JSON" }).click();
  await page.getByLabel("Pomotree import JSON").fill(exportJson);
  await page.getByRole("button", { name: "Restore data" }).click();

  await expect(page.locator("span", { hasText: /^Restored task$/ })).toBeVisible();
  await expect(page.locator("span", { hasText: /^Backup task$/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Remaining time 50:00" })).toBeVisible();
});

test("running timer auto-enters finishing when planned duration expires", async ({ page }) => {
  const oneSecondExport = await page.evaluate(() => {
    const settings = {
      id: "local",
      defaultFocusSeconds: 1,
      defaultBreakSeconds: 300,
      enableNotifications: false,
      theme: "system",
      autoStartBreak: false,
      autoStartNextFocus: false,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-05-26T00:00:00.000Z",
      tasks: [],
      focusSessions: [],
      timerPauses: [],
      interruptions: [],
      userSettings: settings,
    });
  });
  await page.getByRole("button", { name: "Import JSON" }).click();
  await page.getByLabel("Pomotree import JSON").fill(oneSecondExport);
  await page.getByRole("button", { name: "Restore data" }).click();

  await page.getByLabel("Actual attribution").selectOption("");
  await page.getByLabel("Intention without a task").fill("One second auto finish");
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByText("running", { exact: true })).toBeVisible();

  await expect(page.getByText("finishing", { exact: true })).toBeVisible({ timeout: 4000 });
  await expect(page.getByText("Finish this focus session")).toBeVisible();
});

test("settings and custom duration affect the next session", async ({ page }) => {
  await page.getByLabel("Default focus duration").selectOption(String(50 * 60));
  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(17, 17, 17)");
  const focusPanel = page.locator('section.rounded-3xl:has-text("Current focus")');
  await expect(focusPanel).toHaveCSS("background-color", "rgb(27, 27, 27)");
  await expect(page.getByLabel("Intention without a task")).toHaveCSS("background-color", "rgb(27, 27, 27)");
  await expect(page.getByRole("button", { name: "Start focus" })).toHaveCSS("color", "rgb(17, 17, 17)");
  const notifications = page.getByLabel("Browser notifications");
  await expect(notifications).toBeEnabled();
  await expect(page.locator("p", { hasText: "Notification permission:" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Remaining time 50:00" })).toBeVisible();
  await page.getByLabel("Actual attribution").selectOption("");
  await page.getByLabel("Intention without a task").fill("Custom duration session");
  await page.getByLabel("Focus minutes").fill("7");
  await expect(page.getByRole("heading", { name: "Remaining time 07:00" })).toBeVisible();
  await page.getByRole("button", { name: "Start focus" }).click();

  await expect(page.getByText("running", { exact: true })).toBeVisible();
  await expect(page.getByText("Custom duration session")).toBeVisible();
  await expect(page.getByText("7 min")).toBeVisible();
});
