import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
  }, `pomotree-menubar-e2e-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.title.replace(/[^a-z0-9]/gi, "-")}`);
});

test("menubar supports idle start, interruption, pause/resume, finish, and save", async ({ page }) => {
  await page.goto("/menubar", { waitUntil: "networkidle" });

  await expect(page.getByText("Ready to focus")).toBeVisible();
  const menubarBox = await page.locator("main").boundingBox();
  expect(Math.round(menubarBox?.height ?? 0)).toBe(580);
  await expect(page.getByRole("button", { name: "Start Focus" })).toBeDisabled();
  await expect(page.getByText("Duration")).toBeVisible();
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByPlaceholder("Task or path, e.g. Project / Subtask").fill("Menubar e2e focus");
  await page.getByRole("button", { name: "Add task" }).last().click();
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
  await expect(page.getByRole("button", { name: "Discard" })).toBeHidden();
  await expect(page.getByRole("button", { name: "More actions" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Focus complete")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and finish" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What did you complete?" })).toBeHidden();
  await page.getByRole("button", { name: "Add details" }).click();
  await expect(page.getByRole("textbox", { name: "What did you complete?" })).toBeVisible();

  await page.getByRole("textbox", { name: "What did you complete?" }).fill("Completed menubar e2e");
  await page.getByRole("button", { name: "Save and finish" }).click();
  await expect(page.getByText("Ready to focus")).toBeVisible();
});


test("menubar task picker treats parent and child tasks as selectable tree rows", async ({ page }) => {
  await page.goto("/menubar", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByPlaceholder("Task or path, e.g. Project / Subtask").fill("Write report / Research sources");
  await page.getByRole("button", { name: "Add task" }).last().click();

  const taskPicker = page.getByRole("button", { name: /Research sources/ }).first();
  await expect(taskPicker).toBeVisible();
  await expect(taskPicker).toContainText("Research sources");
  await expect(taskPicker).toContainText("Write report");

  await taskPicker.click();
  await expect(page.getByRole("button", { name: "Start unassigned" })).toHaveCount(0);

  await page.getByText("Duration").click();
  await expect(page.getByRole("button", { name: "Collapse Write report" })).toHaveCount(0);

  await taskPicker.click();
  const expandedParent = page.getByRole("button", { name: "Collapse Write report" });
  await expect(expandedParent).toBeVisible();

  const parentRow = page.getByRole("button", { name: /^Write report 1 subtask$/ });
  await expect(parentRow).toBeVisible();

  const childRow = page.getByRole("button", { name: /^Research sources selected$/ });
  await expect(childRow).toBeVisible();
  await expect(childRow).toContainText("Research sources");
  await expect(childRow).not.toContainText("Write report");

  await expandedParent.click();
  await expect(page.getByRole("button", { name: "Expand Write report" })).toBeVisible();
  await expect(childRow).toBeHidden();

  await page.getByRole("button", { name: "Expand Write report" }).click();
  await expect(childRow).toBeVisible();

  await parentRow.click();
  await expect(page.getByRole("button", { name: /Write report/ }).first()).toContainText("1 subtask");

  await page.getByRole("button", { name: "25 min" }).click();
  await expect(page.getByRole("button", { name: "50 min" })).toBeVisible();
  await page.getByRole("heading", { name: "Ready to focus" }).click();
  await expect(page.getByRole("button", { name: "50 min" })).toHaveCount(0);

  await page.getByRole("button", { name: /Write report/ }).first().click();
  await page.getByRole("button", { name: /^Research sources$/ }).click();
  await page.getByRole("button", { name: "Start Focus" }).click();
  await expect(page.getByRole("heading", { name: "Research sources" })).toBeVisible();
  await expect(page.getByText("Write report")).toBeVisible();
});
