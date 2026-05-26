import { expect, test } from "@playwright/test";

async function selectOptionByText(page: Parameters<Parameters<typeof test>[1]>[0]["page"], label: string, text: string) {
  const value = await page.getByLabel(label).locator("option").evaluateAll((options, expectedText) => {
    const match = options.find((option) => option.textContent?.trim() === expectedText);
    return match?.getAttribute("value") ?? null;
  }, text);

  if (!value) throw new Error(`Option not found: ${text}`);
  await page.getByLabel(label).selectOption(value);
}

async function addTaskPath(page: Parameters<Parameters<typeof test>[1]>[0]["page"], value: string) {
  const input = page.getByPlaceholder("Add a task or path, e.g. Project / Subtask");
  await input.fill(value);
  await expect(input).toHaveValue(value);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(input).toHaveValue("");
}

function taskRow(page: Parameters<Parameters<typeof test>[1]>[0]["page"], title: string) {
  return page.locator(`[aria-label="Task row ${title}"]`).first();
}

function moreActions(page: Parameters<Parameters<typeof test>[1]>[0]["page"], title: string) {
  return taskRow(page, title).locator(`[aria-label="More actions for ${title}"]`);
}

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

test("start to finish and interruption tracking", async ({ page }) => {
  await addTaskPath(page, "Product / Draft product loop");

  await page.getByLabel("Actual attribution").selectOption({ label: "— Draft product loop" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByText("running", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("finishing", { exact: true })).toBeVisible();
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Finished e2e validation");
  await page.getByRole("button", { name: "Save completed" }).click();
  await expect(page.getByText("Idle")).toBeVisible();

  await page.getByPlaceholder("Capture an intention, a summary, or the next follow-up task...").fill("Follow up on recovery");
  await page.getByRole("button", { name: "Add interruption" }).click();
  await expect(page.getByText("Follow up on recovery")).toBeVisible();
});

test("refresh restores a running session", async ({ page }) => {
  await addTaskPath(page, "Recovery task");
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
  await addTaskPath(page, "Planned task");
  await addTaskPath(page, "Actual task");

  await page.getByLabel("Actual attribution").selectOption({ label: "Planned task" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await selectOptionByText(page, "Actual attribution", "Actual task");
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Corrected the attribution");
  await page.getByRole("button", { name: "Save completed" }).click();

  const recentSession = page.getByLabel("Recent session: Actual task");
  await expect(recentSession).toBeVisible();
  await expect(recentSession.getByText("Corrected the attribution")).toBeVisible();
});

test("saved session attribution can be corrected from recent history", async ({ page }) => {
  await addTaskPath(page, "Original history task");
  await addTaskPath(page, "Corrected history task");

  await page.getByLabel("Actual attribution").selectOption({ label: "Original history task" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Needs later correction");
  await page.getByRole("button", { name: "Save completed" }).click();

  const originalSession = page.getByLabel("Recent session: Original history task");
  await expect(originalSession).toBeVisible();
  await originalSession.getByRole("button", { name: "Correct attribution" }).click();
  await selectOptionByText(page, "Correct attribution for Original history task", "Corrected history task");
  await page.getByLabel("Correct attribution for Original history task").locator("..").getByRole("button", { name: "Save" }).click();

  await expect(page.getByLabel("Recent session: Corrected history task")).toBeVisible();
  await expect(page.getByLabel("Recent session: Original history task")).toHaveCount(0);
});

test("interruption can be converted into a task", async ({ page }) => {
  await page.getByPlaceholder("Capture an intention, a summary, or the next follow-up task...").fill("Write follow-up task");
  await page.getByRole("button", { name: "Add interruption" }).click();
  await expect(page.getByText("Write follow-up task")).toBeVisible();

  await page.getByRole("button", { name: "Convert to task" }).click();

  await expect(taskRow(page, "Write follow-up task")).toBeVisible();
  await expect(page.getByText("No open interruptions.")).toBeVisible();
});

test("task tree supports inline rename and move", async ({ page }) => {
  await addTaskPath(page, "Project");
  await addTaskPath(page, "Loose task");

  await moreActions(page, "Loose task").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit title for Loose task").fill("Moved task");
  await page.getByLabel("Move Loose task").selectOption({ label: "Project" });
  await page.getByRole("button", { name: "Save task" }).click();

  await expect(taskRow(page, "Moved task")).toBeVisible();
  await expect(taskRow(page, "Loose task")).toHaveCount(0);
});

test("JSON import restores exported data", async ({ page }) => {
  await addTaskPath(page, "Backup task");
  await expect(taskRow(page, "Backup task")).toBeVisible();

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

  await expect(taskRow(page, "Restored task")).toBeVisible();
  await expect(taskRow(page, "Backup task")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Remaining time 50:00" })).toBeVisible();
});
