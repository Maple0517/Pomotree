import { expect, test } from "@playwright/test";

test("shows a storage warning when IndexedDB is unavailable", async ({ page }, testInfo) => {
  await page.addInitScript((dbName) => {
    window.localStorage.setItem("pomotree-db-name", dbName);
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  }, `pomotree-storage-unavailable-${testInfo.workerIndex}-${testInfo.retry}`);

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByText("Not ready")).toBeVisible();
  await expect(page.getByText("Local storage is unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Focus tree, one session at a time" })).toBeVisible();
});
