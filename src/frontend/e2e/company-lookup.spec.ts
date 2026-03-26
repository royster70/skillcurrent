import { test, expect } from "@playwright/test";

test.describe("Company Lookup — ASX Search", () => {
  test("lookup card visible on sectors page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Look up a company")).toBeVisible({ timeout: 10000 });
  });

  test("lookup card expands on click", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Look up a company").click();
    await expect(page.getByPlaceholder(/Type company name/)).toBeVisible({ timeout: 5000 });
  });

  test("ASX search returns results for Telstra", async ({ page }) => {
    await page.goto("/?region=AU");
    await page.getByText("Look up a company").click();

    const input = page.getByPlaceholder(/Type company name/);
    await input.fill("telstra");

    // Wait for ASX search results
    await expect(page.getByText("TELSTRA GROUP LIMITED")).toBeVisible({ timeout: 10000 });
    // ASX code badge visible
    await expect(page.getByText("TLS")).toBeVisible();
  });

  test("ASX search returns results for BHP with multi-sector", async ({ page }) => {
    await page.goto("/?region=AU");
    await page.getByText("Look up a company").click();

    await page.getByPlaceholder(/Type company name/).fill("bhp");

    await expect(page.getByText("BHP GROUP LIMITED")).toBeVisible({ timeout: 10000 });
    // BHP should show multiple sector codes (B + C)
    await expect(page.getByText("ANZSIC B")).toBeVisible();
  });

  test("clicking result populates chip selector", async ({ page }) => {
    await page.goto("/?region=AU");
    await page.getByText("Look up a company").click();

    await page.getByPlaceholder(/Type company name/).fill("woolworths");
    await expect(page.getByText(/WOOLWORTHS/i)).toBeVisible({ timeout: 10000 });

    // Click the result
    await page.getByText(/WOOLWORTHS/i).first().click();

    // Chip selector should now have the sector selected
    // The SectorChipSelector shows selected chips with remove buttons
    await expect(page.getByText("Retail Trade")).toBeVisible({ timeout: 5000 });
  });

  test("no results shows classify button for unknown company", async ({ page }) => {
    await page.goto("/?region=AU");
    await page.getByText("Look up a company").click();

    await page.getByPlaceholder(/Type company name/).fill("zzz unknown corp 999");

    // Wait for search to complete with no results, then classify button appears
    await expect(page.getByRole("button", { name: /Classify with AI/i })).toBeVisible({ timeout: 10000 });
  });

  test("US region hides ASX results", async ({ page }) => {
    await page.goto("/?region=US");
    await page.getByText("Look up a company").click();

    await page.getByPlaceholder(/Type company name/).fill("telstra");

    // Should not find Telstra in US mode (no ASX data for US)
    // Wait a moment for search to complete
    await page.waitForTimeout(1000);
    await expect(page.getByText("TELSTRA GROUP LIMITED")).not.toBeVisible();
  });

  test("lookup card collapses on second click", async ({ page }) => {
    await page.goto("/?region=AU");
    await page.getByText("Look up a company").click();
    await expect(page.getByPlaceholder(/Type company name/)).toBeVisible({ timeout: 5000 });

    // Click header again to collapse
    await page.getByText("Look up a company").click();
    await expect(page.getByPlaceholder(/Type company name/)).not.toBeVisible({ timeout: 3000 });
  });

  test("region toggle resets search state", async ({ page }) => {
    await page.goto("/?region=AU");
    await page.getByText("Look up a company").click();
    await page.getByPlaceholder(/Type company name/).fill("telstra");
    await expect(page.getByText("TELSTRA GROUP LIMITED")).toBeVisible({ timeout: 10000 });

    // Toggle to US
    await page.getByText("US").first().click();

    // Expand lookup again — search should be cleared
    await page.getByText("Look up a company").click();
    const input = page.getByPlaceholder(/Type company name/);
    await expect(input).toHaveValue("");
  });
});
