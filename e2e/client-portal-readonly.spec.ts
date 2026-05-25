import { test, expect } from "@playwright/test";
import { mockRequestedTrip, pilotClienteHeaders } from "./helpers/pilot-fixtures";

/**
 * Portal cliente fase read-only (sem POST cancel/tracking).
 * Requer TRUST_HEADER_AUTH no ambiente de teste.
 */
test.describe("Portal cliente — modo consulta", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotClienteHeaders());
    await page.route("**/api/trips**", async (route) => {
      const url = route.request().url();
      if (route.request().method() === "GET" && !url.match(/\/api\/trips\/[^/]+$/)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { items: [mockRequestedTrip()], page: 1, pageSize: 50, total: 1 }
          })
        });
        return;
      }
      await route.continue();
    });
  });

  test("mostra Modo consulta e Ver detalhe sem cancelar", async ({ page }) => {
    await page.goto("/client");
    await expect(page.getByRole("heading", { name: "Portal corporativo" })).toBeVisible();
    await expect(page.getByText("Modo consulta")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Ver detalhe" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar solicitação" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Nova solicitação" })).toHaveCount(0);
  });
});
