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

test.describe("AEI Task Intelligence Panel", () => {
  test("panel header visible when occupation selected", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("Task Positioning Matrix")).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("AEI Task Intelligence")).toBeVisible({ timeout: 5000 });
  });

  test("panel expands on click and shows sub-headings", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("AEI Task Intelligence")).toBeVisible({ timeout: 15000 });

    // Expand
    await page.getByText("AEI Task Intelligence").click();

    // Sub-headings should appear
    await expect(page.getByText("TASK USAGE TRAJECTORY")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("TASK PENETRATION RANKING")).toBeVisible({ timeout: 5000 });
  });

  test("panel shows tracked task count", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("AEI Task Intelligence")).toBeVisible({ timeout: 15000 });

    // Header metadata shows tracked count
    await expect(page.getByText(/\d+ of \d+ tasks tracked/)).toBeVisible({ timeout: 5000 });
  });

  test("panel collapses on second click", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("AEI Task Intelligence")).toBeVisible({ timeout: 15000 });

    // Expand then collapse
    await page.getByText("AEI Task Intelligence").click();
    await expect(page.getByText("TASK USAGE TRAJECTORY")).toBeVisible({ timeout: 5000 });

    await page.getByText("AEI Task Intelligence").click();
    await expect(page.getByText("TASK USAGE TRAJECTORY")).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("GDPval Benchmark Panel", () => {
  test("panel visible for benchmark occupation", async ({ page }) => {
    // 15-1252.00 has 5 GDPval tasks
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("Task Positioning Matrix")).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("GDPval Benchmark")).toBeVisible({ timeout: 5000 });
  });

  test("panel expands and loads benchmark data", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("GDPval Benchmark")).toBeVisible({ timeout: 15000 });

    await page.getByText("GDPval Benchmark").click();

    // Wait for API load and content render
    await expect(page.getByText("TASK SCORE RANGES")).toBeVisible({ timeout: 15000 });
  });

  test("panel shows real-world task count", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("GDPval Benchmark")).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/\d+ real-world tasks/)).toBeVisible({ timeout: 5000 });
  });

  test("panel not rendered for non-benchmark occupation", async ({ page }) => {
    // 11-1011.00 (Chief Executives) has 0 GDPval tasks
    await page.goto("/occupations?selected=11-1011.00");
    await expect(page.getByRole("heading", { name: "Chief Executives" })).toBeVisible({ timeout: 10000 });

    // GDPval panel should NOT be present
    await expect(page.getByText("GDPval Benchmark")).not.toBeVisible({ timeout: 5000 });
  });

  test("direct URL loads with both panels accessible", async ({ page }) => {
    await page.goto("/occupations?selected=15-1252.00");
    await expect(page.getByText("Task Positioning Matrix")).toBeVisible({ timeout: 15000 });

    // Both panels should be present
    await expect(page.getByText("AEI Task Intelligence")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("GDPval Benchmark")).toBeVisible({ timeout: 5000 });
  });
});
