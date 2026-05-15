import { test, expect } from "@playwright/test";
import {
  PILOT_MOCK_DRIVER_ID,
  PILOT_MOCK_TRIP_APPROVED_ID,
  mockApprovedTrip,
  mockDispatchedTrip,
  mockDriversList,
  mockVehiclesList,
  pilotMotoristaHeaders,
  pilotOperadorHeaders
} from "./helpers/pilot-fixtures";

const MOCK_OFFER_ID = "o1000000-0000-4000-8000-000000000001";

/**
 * UI piloto: operador despacha na agenda e motorista aceita no /driver.
 * CI com TRUST_HEADER_AUTH=true e APIs mockadas.
 */
test.describe("Pilot agenda → motorista (mock CI)", () => {
  test("operador cria oferta na agenda", async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotOperadorHeaders());
    await page.route(`**/api/trips/${PILOT_MOCK_TRIP_APPROVED_ID}/dispatch-offers`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { items: [] } })
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/drivers**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: mockDriversList() })
      });
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
    await page.route("**/api/dispatch/offers", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id: MOCK_OFFER_ID, status: "open", trip_id: PILOT_MOCK_TRIP_APPROVED_ID }
        })
      });
    });

    await page.goto(`/agenda?trip=${PILOT_MOCK_TRIP_APPROVED_ID}`);
    await expect(page.getByText("Despacho por oferta")).toBeVisible();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Criar oferta" }).click();
    await expect(page.getByText("Oferta enviada aos parceiros")).toBeVisible({ timeout: 10_000 });
  });

  test("operador despacha corrida aprovada na agenda", async ({ page }) => {
    let trip = mockApprovedTrip();

    await page.setExtraHTTPHeaders(pilotOperadorHeaders());
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
          data: { items: [trip], page: 1, pageSize: 100, total: 1 }
        })
      });
    });
    await page.route("**/api/drivers**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: mockDriversList() })
      });
    });
    await page.route("**/api/vehicles**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: mockVehiclesList() })
      });
    });
    await page.route(`**/api/trips/${PILOT_MOCK_TRIP_APPROVED_ID}/dispatch-directed`, async (route) => {
      trip = mockDispatchedTrip();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: trip })
      });
    });
    await page.route(`**/api/trips/${PILOT_MOCK_TRIP_APPROVED_ID}/operational-claim**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { trip_id: PILOT_MOCK_TRIP_APPROVED_ID } })
      });
    });

    await page.goto(`/agenda?trip=${PILOT_MOCK_TRIP_APPROVED_ID}`);
    await expect(page.getByRole("heading", { name: "Agenda operacional" })).toBeVisible();
    await expect(page.getByText("Despacho direcionado")).toBeVisible();
    await page.getByLabel("Motorista").selectOption(PILOT_MOCK_DRIVER_ID);
    await page.getByRole("button", { name: "Despachar corrida" }).click();
    await expect(page.getByText("Corrida despachada ao motorista.")).toBeVisible({ timeout: 10_000 });
  });

  test("motorista aceita oferta no PWA", async ({ page }) => {
    await page.setExtraHTTPHeaders(pilotMotoristaHeaders());
    await page.route("**/api/dispatch/offers/open**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: MOCK_OFFER_ID,
                expires_at: new Date(Date.now() + 3600_000).toISOString(),
                trip: {
                  scheduled_at: new Date().toISOString(),
                  origin_text: "Hotel",
                  destination_text: "Aeroporto",
                  passenger_name: "Teste"
                },
                my_response: null
              }
            ]
          }
        })
      });
    });
    await page.route(`**/api/dispatch/offers/${MOCK_OFFER_ID}/accept`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { accepted: true } })
      });
    });
    await page.route("**/api/trips**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { items: [], page: 1, pageSize: 30, total: 0 } })
      });
    });

    await page.goto("/driver");
    await expect(page.getByText("Ofertas da central")).toBeVisible();
    await page.getByRole("button", { name: "Aceitar oferta" }).click();
    await expect(page.getByText(/Aceite registado/i)).toBeVisible({ timeout: 10_000 });
  });

  test("motorista aceita corrida despachada no PWA", async ({ page }) => {
    const trip = mockDispatchedTrip();

    await page.setExtraHTTPHeaders(pilotMotoristaHeaders());
    await page.route("**/api/trips**", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { items: [trip], page: 1, pageSize: 30, total: 1 }
          })
        });
        return;
      }
      if (method === "POST" && route.request().url().includes("/status")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { ...trip, operational_status: "accepted" }
          })
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/driver");
    await expect(page.getByRole("heading", { name: "Corridas activas" })).toBeVisible();
    await expect(page.getByText("ABC1D23")).toBeVisible();
    await page.getByRole("button", { name: "Aceitar corrida" }).click();
    await expect(page.getByText(/Estado:\s*Aceita/i)).toBeVisible({ timeout: 10_000 });
  });
});
