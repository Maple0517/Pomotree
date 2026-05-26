import { expect, test } from "@playwright/test";

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

async function seedLegacyArchivedFinishingSession(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  const dbName = await page.evaluate(() => window.localStorage.getItem("pomotree-db-name"));
  if (!dbName) throw new Error("Missing e2e database name");

  await page.evaluate(async ({ databaseName }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["tasks", "focusSessions"], "readwrite");
      tx.objectStore("tasks").put({
        id: "legacy-archived-task",
        parentId: null,
        title: "Legacy archived task",
        status: "archived",
        previousStatus: "todo",
        sortOrder: 0,
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
        archivedAt: "2026-05-26T00:00:00.000Z",
      });
      tx.objectStore("focusSessions").put({
        id: "legacy-finishing-session",
        taskId: "legacy-archived-task",
        originalTaskId: "legacy-archived-task",
        taskPathSnapshot: "Legacy archived task",
        originalTaskPathSnapshot: "Legacy archived task",
        intention: null,
        summary: null,
        plannedSeconds: 1500,
        actualSeconds: 1500,
        status: "finishing",
        startedAt: "2026-05-26T00:00:00.000Z",
        endedAt: null,
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:25:00.000Z",
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }, { databaseName: dbName });
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
  }, `pomotree-e2e-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.title.replace(/[^a-z0-9]/gi, "-")}`);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Local-first MVP").waitFor();
});

test("smoke flow: create a path, start focus, and save completion", async ({ page }) => {
  const taskTree = page.locator("section").filter({ hasText: "Task tree" }).first();

  await expect(page.getByRole("heading", { name: "Focus tree, one session at a time" })).toBeVisible();
  await expect(taskTree.getByText("No tasks yet. Create your first focus tree node.")).toBeVisible();

  await addTaskPath(page, "Project Alpha / Draft");

  await expect(taskRow(page, "Project Alpha")).toBeVisible();
  await expect(taskRow(page, "Draft")).toBeVisible();

  await page.getByRole("button", { name: "Focus Project Alpha" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByText("running", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Finish this focus session")).toBeVisible();

  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Completed the smoke test flow.");
  await page.getByLabel("Mark attributed task done").check();
  await page.getByRole("button", { name: "Save completed" }).click();

  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  await expect(page.getByText("Finish this focus session")).toHaveCount(0);
  await moreActions(page, "Project Alpha").click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
});

test("direct subtask creation and done-task actions follow the v1 lifecycle", async ({ page }) => {
  const taskTree = page.locator("section").filter({ hasText: "Task tree" }).first();

  await addTaskPath(page, "Project");
  await taskTree.getByRole("button", { name: "Add subtask under Project" }).click();
  await page.getByRole("textbox", { name: "Subtask title under Project" }).fill("Draft");
  await page.getByRole("button", { name: "Add subtask", exact: true }).click();

  await expect(taskRow(page, "Draft")).toBeVisible();

  await moreActions(page, "Project").click();
  await page.getByRole("button", { name: "Done" }).click();
  await moreActions(page, "Project").click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(taskTree.getByRole("button", { name: "Focus Project" })).toHaveCount(0);
  await expect(taskTree.getByRole("button", { name: "Add subtask under Project" })).toHaveCount(0);
  await expect(taskRow(page, "Draft")).toBeVisible();

  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(taskTree.getByRole("button", { name: "Focus Project" })).toBeVisible();
  await expect(taskTree.getByRole("button", { name: "Add subtask under Project" })).toHaveCount(1);
});

test("task tree collapses by depth and auto-expands the selected path", async ({ page }) => {
  const taskTree = page.locator("section").filter({ hasText: "Task tree" }).first();

  await addTaskPath(page, "Project / Draft / Review");
  await expect(taskRow(page, "Project")).toBeVisible();
  await expect(taskRow(page, "Draft")).toBeVisible();
  await expect(taskRow(page, "Review")).toHaveCount(0);

  await taskRow(page, "Project").getByRole("button", { name: "Select Project" }).click();
  await expect(taskRow(page, "Draft")).toBeVisible();

  await taskTree.getByRole("button", { name: "Expand Draft" }).click();
  await expect(taskRow(page, "Review")).toBeVisible();

  await taskTree.getByRole("button", { name: "Collapse Project" }).click();
  await expect(taskRow(page, "Draft")).toHaveCount(0);
  await expect(taskRow(page, "Review")).toHaveCount(0);

  await page.getByLabel("Actual attribution").selectOption({ label: "— — Review" });
  await expect(taskRow(page, "Draft")).toBeVisible();
  await expect(taskRow(page, "Review")).toBeVisible();
});

test("archive hides active branch and restore brings it back while keeping history", async ({ page }) => {
  const archivedPanel = page.locator("section").filter({ hasText: "Archived Tasks" }).first();
  const todaySection = page.locator("div.rounded-3xl").filter({ hasText: "Today" }).first();

  await addTaskPath(page, "Project / Draft");
  await expect(taskRow(page, "Project")).toBeVisible();
  await expect(taskRow(page, "Draft")).toBeVisible();

  await page.getByLabel("Actual attribution").selectOption({ label: "— Draft" });
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Archived branch stats");
  await page.getByRole("button", { name: "Save completed" }).click();

  await expect(page.getByLabel("Recent session: Project / Draft")).toBeVisible();
  await expect(todaySection.locator("div.rounded-2xl").filter({ hasText: /Completed\s*1/ })).toBeVisible();

  await moreActions(page, "Project").click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();

  await expect(taskRow(page, "Project")).toHaveCount(0);
  await expect(taskRow(page, "Draft")).toHaveCount(0);
  await expect(archivedPanel.locator("p", { hasText: /^Project$/ }).first()).toBeVisible();
  await expect(archivedPanel.getByText(/1 🍅/)).toBeVisible();

  const attributionOptions = await page.locator("#task-attribution option").allTextContents();
  expect(attributionOptions.join(" ")).not.toContain("Project");
  expect(attributionOptions.join(" ")).not.toContain("Draft");

  await archivedPanel.getByRole("button", { name: "Restore" }).click();

  await expect(taskRow(page, "Project")).toBeVisible();
  await expect(taskRow(page, "Draft")).toBeVisible();
  await expect(page.getByLabel("Recent session: Project / Draft")).toBeVisible();
});

test("legacy archived finishing session can still be saved without restoring the task", async ({ page }) => {
  await seedLegacyArchivedFinishingSession(page);
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.getByText("Finish this focus session")).toBeVisible();
  await expect(page.getByLabel("Actual attribution")).toHaveValue("legacy-archived-task");
  await expect(page.locator("#task-attribution option")).toContainText(["Current archived attribution: Legacy archived task"]);
  await expect(page.getByLabel("Mark attributed task done")).toHaveCount(0);

  await page.getByPlaceholder("What did you actually complete? Summary is optional for MVP.").fill("Recovered legacy archived session");
  await page.getByRole("button", { name: "Save completed" }).click();

  await expect(page.getByText("Finish this focus session")).toHaveCount(0);
  await expect(page.getByLabel("Recent session: Legacy archived task")).toBeVisible();
  await expect(
    page.locator("section").filter({ hasText: "Archived Tasks" }).locator("p", { hasText: /^Legacy archived task$/ }).first(),
  ).toBeVisible();
});
