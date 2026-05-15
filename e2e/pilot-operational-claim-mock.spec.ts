import { test, expect } from "@playwright/test";
import { PILOT_MOCK_TRIP_APPROVED_ID, mockApprovedTrip, pilotOperadorHeaders } from "./helpers/pilot-fixtures";

/**
 * Barra de multiatendimento na agenda (mock CI).
 */
test.describe("Pilot multiatendimento (mock CI)", () => {
  test("barra de claim visível e assume atendimento", async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotOperadorHeaders());

    let claimed = false;

    await page.route(`**/api/trips/${PILOT_MOCK_TRIP_APPROVED_ID}/operational-claim`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              active: claimed
                ? {
                    operator_profile_id: "pilot-operador",
                    claimed_at: new Date().toISOString(),
                    operator_name: "Operador Piloto"
                  }
                : null
            }
          })
        });
        return;
      }
      if (method === "POST") {
        claimed = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { claimed: true } })
        });
        return;
      }
      await route.continue();
    });

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
          data: { items: [mockApprovedTrip()], page: 1, pageSize: 100, total: 1 }
        })
      });
    });

    await page.goto(`/agenda?trip=${PILOT_MOCK_TRIP_APPROVED_ID}`);
    await expect(page.getByText("Multiatendimento")).toBeVisible();
    await page.getByRole("button", { name: "Assumir" }).click();
    await expect(page.getByText("Operador Piloto")).toBeVisible({ timeout: 10_000 });
  });
});
