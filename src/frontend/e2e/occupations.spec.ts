import { test, expect } from "@playwright/test";

test.describe("Occupations Page", () => {
  test("hierarchy tree loads with major groups", async ({ page }) => {
    await page.goto("/occupations");

    await expect(page.getByRole("heading", { name: "Occupations" })).toBeVisible();
    await expect(page.getByText("Management")).toBeVisible();
    await expect(page.getByText("Computer and Mathematical")).toBeVisible();
  });

  test("expanding a group shows occupations", async ({ page }) => {
    await page.goto("/occupations");

    await page.getByText("Management").click();
    await expect(page.getByText("Chief Executives")).toBeVisible({ timeout: 5000 });
  });

  test("selecting an occupation shows task matrix", async ({ page }) => {
    await page.goto("/occupations");

    await page.getByText("Computer and Mathematical").click();
    await expect(page.getByText("Software Developers")).toBeVisible({ timeout: 5000 });

    await page.getByText("Software Developers").first().click();

    // Task matrix should appear — wait longer for matrix API
    await expect(page.getByText("Task Positioning Matrix")).toBeVisible({ timeout: 15000 });

    // Score chips
    await expect(page.getByText("Eloundou", { exact: true })).toBeVisible();
  });

  test("task list shows below task matrix", async ({ page }) => {
    await page.goto("/occupations");
    await page.getByText("Computer and Mathematical").click();
    await page.getByText("Software Developers").first().click();

    await expect(page.getByText(/Tasks \(/)).toBeVisible({ timeout: 15000 });
  });

  test("direct URL with selected param loads occupation", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");

    // Wait for hierarchy to load and auto-expand
    await expect(page.getByRole("heading", { name: "Software Developers" })).toBeVisible({ timeout: 10000 });

    // Task matrix should render
    await expect(page.getByText("Task Positioning Matrix")).toBeVisible({ timeout: 15000 });
  });
});
