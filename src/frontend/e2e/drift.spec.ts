import { test, expect } from "@playwright/test";

test.describe("Drift Analysis Page", () => {
  test("loads with metric cards and charts", async ({ page }) => {
    await page.goto("/drift");

    await expect(page.getByRole("heading", { name: "Drift Analysis" })).toBeVisible();

    // Metric cards — use exact match to avoid hitting chart labels
    await expect(page.getByText("DEPARTING", { exact: true })).toBeVisible();
    await expect(page.getByText("ENDURING", { exact: true })).toBeVisible();
    await expect(page.getByText("BELOW THRESHOLD", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("TOTAL TRACKED", { exact: true })).toBeVisible();
  });

  test("below threshold alert is visible", async ({ page }) => {
    await page.goto("/drift");
    await expect(page.getByText("Highest Priority Signal")).toBeVisible({ timeout: 10000 });
  });

  test("departing tasks are listed", async ({ page }) => {
    await page.goto("/drift");
    await expect(page.getByText("Fastest Departing")).toBeVisible({ timeout: 10000 });
  });

  test("enduring tasks are listed", async ({ page }) => {
    await page.goto("/drift");
    await expect(page.getByText("Top Enduring")).toBeVisible({ timeout: 10000 });
  });
});
