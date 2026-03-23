import { test, expect } from "@playwright/test";

test.describe("Sectors Page", () => {
  test("loads sector overview with metric cards and table", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Industry Sectors" })).toBeVisible();

    // Metric cards — exact match
    await expect(page.getByText("INSULATED (E0)", { exact: true })).toBeVisible();
    await expect(page.getByText("AUGMENTED (E1)", { exact: true })).toBeVisible();
    await expect(page.getByText("AUTOMATED (E2)", { exact: true })).toBeVisible();

    // Sector table rows
    await expect(page.locator("td").filter({ hasText: "Health Care" }).first()).toBeVisible();
  });

  test("clicking a sector navigates to sector detail", async ({ page }) => {
    await page.goto("/");

    // Click on a sector row
    await page.locator("tr").filter({ hasText: "Retail Trade" }).click();

    // Should navigate to sector detail
    await expect(page.getByText("Priority Roles", { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Workforce AI")).toBeVisible();

    // Navigate to drift
    await page.getByRole("link", { name: /Drift Analysis/ }).click();
    await expect(page.getByRole("heading", { name: "Drift Analysis" })).toBeVisible({ timeout: 5000 });

    // Navigate to occupations
    await page.getByRole("link", { name: /Occupations/ }).click();
    await expect(page.getByRole("heading", { name: "Occupations" })).toBeVisible({ timeout: 5000 });
  });

  test("sidebar collapses and expands", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Impact Analysis Platform")).toBeVisible();

    // Collapse
    await page.getByTitle("Collapse sidebar").click();
    await expect(page.getByText("Impact Analysis Platform")).not.toBeVisible();

    // Expand
    await page.getByTitle("Expand sidebar").click();
    await expect(page.getByText("Impact Analysis Platform")).toBeVisible();
  });
});
