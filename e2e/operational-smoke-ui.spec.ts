import { test, expect } from "@playwright/test";
import { pilotClienteHeaders } from "./helpers/pilot-fixtures";

/**
 * UI operacional mínima (mock) — alinhado ao roteiro OPERATIONAL_HUMAN_SMOKE.md
 */
test.describe("Smoke UI — labels operacionais", () => {
  test("agenda hint menciona Abrir", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page.getByText(/Abrir.*aprovar/i)).toBeVisible({ timeout: 15_000 });
  });

  test("cliente read-only mostra aviso modo consulta", async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotClienteHeaders());
    await page.route("**/api/trips**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { items: [], page: 1, pageSize: 50, total: 0 } })
      });
    });
    await page.goto("/client");
    await expect(page.getByText("Modo consulta activo")).toBeVisible({ timeout: 15_000 });
  });
});
