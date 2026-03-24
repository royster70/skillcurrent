import { test, expect } from "@playwright/test";

test.describe("Composite Sector — Selector", () => {
  test("chip selector bar visible on sectors page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Build composite view...")).toBeVisible({ timeout: 10000 });
  });

  test("sector dropdown opens on click", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Build composite view...").click();
    await expect(page.getByPlaceholder("Search sectors...")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Composite Sector — Detail Page", () => {
  test("composite page loads with 2 sectors", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54");
    await expect(page.getByText("Composite Sector Analysis")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/2 sectors combined/)).toBeVisible();
  });

  test("metric cards show blended data", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54");
    await expect(page.getByText("INSULATED (E0)")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("AUGMENTED (E1)")).toBeVisible();
    await expect(page.getByText("AUTOMATED (E2)")).toBeVisible();
    await expect(page.getByText("WEIGHTED BETA")).toBeVisible();
  });

  test("occupation table shows de-duplicated roles", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54");
    await expect(page.getByText("Unified Occupations")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/unique occupations across 2 sectors/)).toBeVisible();
  });

  test("narrative summary panel renders", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54");
    await expect(page.getByText("COMPOSITE INTELLIGENCE SUMMARY")).toBeVisible({ timeout: 15000 });
  });

  test("sector chips display in header", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54");
    await expect(page.getByText("SECTORS")).toBeVisible({ timeout: 15000 });
    // At least one sector name should be visible as a chip
    await expect(page.getByText(/Health Care/)).toBeVisible();
  });

  test("edit sectors link navigates back", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54");
    await expect(page.getByText("Edit sectors")).toBeVisible({ timeout: 15000 });
  });

  test("single code shows error message", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62");
    await expect(page.getByText(/Select 2 or more sectors/)).toBeVisible({ timeout: 10000 });
  });

  test("3-sector composite loads correctly", async ({ page }) => {
    await page.goto("/sectors/composite?codes=62,54,51");
    await expect(page.getByText("Composite Sector Analysis")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/3 sectors combined/)).toBeVisible();
  });
});
