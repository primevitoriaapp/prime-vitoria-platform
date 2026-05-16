import { test, expect } from "@playwright/test";
import { mockApprovedTrip, pilotOperadorHeaders } from "./helpers/pilot-fixtures";

test.describe("Pilot fila operacional (mock CI)", () => {
  test("lista fila com claim e filtro só sem atendimento", async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotOperadorHeaders());

    const trip = { ...mockApprovedTrip(), operational_status: "approved" as const };

    await page.route("**/api/clients**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [] })
      });
    });

    await page.route("**/api/operations/queue**", async (route) => {
      const url = new URL(route.request().url());
      const unclaimed = url.searchParams.get("unclaimedOnly") === "true";
      const items = unclaimed
        ? []
        : [
            {
              ...trip,
              claim: {
                operator_profile_id: "pilot-operador",
                claimed_at: new Date().toISOString(),
                operator_name: "Operador Piloto"
              }
            }
          ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items, page: 1, pageSize: 40, total: items.length, filtered_count: items.length }
        })
      });
    });

    await page.goto("/dispatch");
    await expect(page.getByRole("heading", { name: "Fila operacional" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Operador Piloto")).toBeVisible();

    await page.getByLabel("Só sem atendimento").check();
    await expect(page.getByText("Nenhuma viagem activa na fila.")).toBeVisible({ timeout: 10_000 });
  });
});
