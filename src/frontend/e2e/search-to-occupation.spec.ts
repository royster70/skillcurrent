import { test, expect } from "@playwright/test";

test.describe("Search → Occupation Flow", () => {
  test("text search returns results with scores", async ({ page }) => {
    await page.goto("/search");

    await expect(page.getByRole("heading", { name: "Role Search" })).toBeVisible();

    // Switch to text search
    await page.getByRole("button", { name: /Text Search/ }).click();

    // Type and search
    await page.getByPlaceholder(/Job title/).fill("software developer");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Should show results
    await expect(page.getByText(/occupation/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Software Developers")).toBeVisible();
  });

  test("semantic search returns results", async ({ page }) => {
    await page.goto("/search");

    // Semantic is default
    await page.getByPlaceholder(/Job title/).fill("DevOps Engineer");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Should find results
    await expect(page.getByText(/occupation/i)).toBeVisible({ timeout: 15000 });
  });

  test("clicking search result navigates to occupation with detail", async ({ page }) => {
    await page.goto("/search");

    // Text search for reliable results
    await page.getByRole("button", { name: /Text Search/ }).click();
    await page.getByPlaceholder(/Job title/).fill("accountant");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Wait for results
    await expect(page.getByText(/occupation/i)).toBeVisible({ timeout: 10000 });

    // Click first result
    await page.getByText("Accountants and Auditors").first().click();

    // Should navigate to occupations page with task matrix
    await expect(page.getByText("Task Positioning Matrix")).toBeVisible({ timeout: 10000 });
  });

  test("semantic search with job description", async ({ page }) => {
    await page.goto("/search");

    await page.getByPlaceholder(/Job title/).fill("Data Analyst");
    await page.getByPlaceholder(/Paste the job description/).fill(
      "Analyze datasets, build dashboards, write SQL queries"
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText(/occupation/i)).toBeVisible({ timeout: 15000 });
  });

  test("suggested terms populate search field", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("button", { name: "DevOps Engineer" }).click();
    const input = page.getByPlaceholder(/Job title/);
    await expect(input).toHaveValue("DevOps Engineer");
  });
});
