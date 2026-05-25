import { test, expect } from "@playwright/test";
import type { Trip } from "../src/lib/domain/types";

const MOCK_TRIP: Trip = {
  id: "c2000000-0000-4000-8000-000000000001",
  tenant_id: "a0000000-0000-0000-0000-000000000001",
  client_id: "c1000000-0000-4000-8000-000000000001",
  operational_status: "dispatched",
  financial_status: "pending",
  dispatch_mode: "directed",
  scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
  origin_text: "Aeroporto de Vitória — ES",
  destination_text: "Praia do Canto, Vitória — ES",
  origin_lat: -20.2581,
  origin_lng: -40.2869,
  destination_lat: -20.2976,
  destination_lng: -40.2958,
  passenger_name: "Maria Staging",
  service_type: "Transfer",
  vehicle: { id: "v1", plate: "ABC1D23", model: "Sedan" },
  driver_id: "d0000000-0000-4000-8000-000000000001"
};

function mockTripsResponse(page: import("@playwright/test").Page, trip: Trip) {
  return page.route("**/api/trips?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [trip], page: 1, pageSize: 30, total: 1 }
      })
    });
  });
}

test.describe("Driver panel visual captures", () => {
  test.use({
    extraHTTPHeaders: {
      "x-role": "motorista",
      "x-driver-id": "d0000000-0000-4000-8000-000000000001"
    }
  });

  test("screenshot: corrida actual despachada", async ({ page }) => {
    await mockTripsResponse(page, { ...MOCK_TRIP, operational_status: "dispatched" });
    await page.route("**/api/dispatch/offers/open", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { items: [] } })
      });
    });
    await page.route("**/api/drivers/operational-status", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { status: "online" } })
      });
    });
    await page.route("**/api/drivers/push-readiness", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { operationalReady: false } })
      });
    });
    await page.route("**/api/finance/driver-payables*", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { items: [] } })
      });
    });

    await page.goto("/driver");
    await expect(page.getByText("Corrida actual", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Aceitar corrida/i })).toBeVisible();
    await expect(page.getByText("Origem")).toBeVisible();
    await expect(page.getByText("Destino")).toBeVisible();
    await expect(page.getByRole("link", { name: /Navegar/i })).toBeVisible();

    await page.screenshot({
      path: "artifacts/driver-panel-dispatched.png",
      fullPage: true
    });
  });

  test("screenshot: em andamento com próximo passo", async ({ page }) => {
    await mockTripsResponse(page, { ...MOCK_TRIP, operational_status: "on_the_way" });
    await page.route("**/api/dispatch/offers/open", async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: { items: [] } }) });
    });
    await page.route("**/api/drivers/operational-status", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { status: "online" } })
      });
    });
    await page.route("**/api/drivers/push-readiness", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { operationalReady: false } })
      });
    });
    await page.route("**/api/finance/driver-payables*", async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: { items: [] } }) });
    });

    await page.goto("/driver");
    await expect(page.getByText(/Próximo:/i)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: "artifacts/driver-panel-on-the-way.png",
      fullPage: true
    });
  });
});
