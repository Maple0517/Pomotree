import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
  }, `pomotree-e2e-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.title.replace(/[^a-z0-9]/gi, "-")}`);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Local-first MVP").waitFor();
});

test("smoke flow: create a path, start focus, and save completion", async ({ page }) => {

  await expect(page.getByRole("heading", { name: "Focus tree, one session at a time" })).toBeVisible();
  await expect(page.getByText("No tasks yet. Create your first focus tree node.")).toBeVisible();

  await page.getByPlaceholder("Add a task or path, e.g. Project / Subtask").fill("Project Alpha / Draft");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.waitForSelector('span:has-text("Project Alpha")');
  await expect(page.locator("span", { hasText: /^Project Alpha$/ })).toBeVisible();
  await expect(page.locator("span", { hasText: /^↳ Draft$/ })).toBeVisible();

  await page.getByRole("button", { name: "Focus Project Alpha" }).click();

  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByText("running", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Finish this focus session")).toBeVisible();

  await page
    .getByPlaceholder("What did you actually complete? Summary is optional for MVP.")
    .fill("Completed the smoke test flow.");
  await page.getByLabel("Mark attributed task done").check();
  await page.getByRole("button", { name: "Save completed" }).click();

  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  await expect(page.getByText("Finish this focus session")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
});
