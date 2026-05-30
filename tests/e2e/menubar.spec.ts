import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
  }, `pomotree-menubar-e2e-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.title.replace(/[^a-z0-9]/gi, "-")}`);
});

test("menubar supports idle start, interruption, pause/resume, finish, and save", async ({ page }) => {
  await page.goto("/menubar", { waitUntil: "networkidle" });

  await expect(page.getByText("Ready to focus")).toBeVisible();
  await page.getByRole("textbox", { name: "Intent" }).fill("Menubar e2e focus");
  await page.getByRole("button", { name: "Start Focus" }).click();

  await expect(page.getByText("Menubar e2e focus")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();

  await page.getByLabel("Quick capture").fill("Menubar e2e interruption");
  await page.getByRole("button", { name: "Save capture" }).click();
  await expect(page.getByText("Recorded: Menubar e2e interruption")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText(/Paused/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Focus complete")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What did you complete?" })).toBeVisible();

  await page.getByRole("textbox", { name: "What did you complete?" }).fill("Completed menubar e2e");
  await page.getByRole("button", { name: "Save completed" }).click();
  await expect(page.getByText("Ready to focus")).toBeVisible();
});
