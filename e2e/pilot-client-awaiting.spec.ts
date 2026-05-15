import { test, expect } from "@playwright/test";
import { mockRequestedTrip, pilotClienteHeaders } from "./helpers/pilot-fixtures";

/**
 * UI do portal cliente com API mockada (CI sem Supabase real).
 * Requer TRUST_HEADER_AUTH=true em produção (job Playwright no CI).
 */
test.describe("Pilot cliente — aguarda aprovação", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotClienteHeaders());
    await page.route("**/api/trips**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [mockRequestedTrip()], page: 1, pageSize: 50, total: 1 }
        })
      });
    });
  });

  test("mostra indicador Aguarda aprovação para corrida requested", async ({ page }) => {
    await page.goto("/client");
    await expect(page.getByRole("heading", { name: "Portal corporativo" })).toBeVisible();
    await expect(page.getByText("Aguarda aprovação").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Solicitada")).toBeVisible();
  });
});
