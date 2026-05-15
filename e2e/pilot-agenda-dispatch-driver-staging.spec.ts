import { test, expect } from "@playwright/test";
import {
  getStagingAuthConfig,
  signInStaging,
  stagingEmailByRole,
  stagingTestsEnabled
} from "./helpers/staging-auth";
import { PILOT_STAGING_CLIENT_ID } from "./helpers/pilot-fixtures";

/**
 * Fluxo completo staging: cliente → aprovar → despacho → motorista aceita.
 * PLAYWRIGHT_STAGING=1 + STAGING_E2E_PASSWORD + seed.
 */
test.describe("Pilot agenda despacho → motorista aceita (staging)", () => {
  test.skip(!stagingTestsEnabled(), "Defina PLAYWRIGHT_STAGING=1 e credenciais staging");

  test("API: aprovar, despachar e motorista aceita", async ({ request }) => {
    const config = getStagingAuthConfig()!;
    const base = config.baseUrl;

    const clientToken = await signInStaging({
      ...config,
      role: "cliente",
      email: stagingEmailByRole.cliente
    });
    const operadorToken = await signInStaging({
      ...config,
      role: "operador",
      email: stagingEmailByRole.operador
    });
    const motoristaToken = await signInStaging({
      ...config,
      role: "motorista",
      email: stagingEmailByRole.motorista
    });

    const driversRes = await request.get(`${base}/api/drivers`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    expect(driversRes.ok()).toBeTruthy();
    const driversJson = (await driversRes.json()) as {
      success?: boolean;
      data?: { id: string; default_vehicle?: { id: string } | null }[];
    };
    const driverId = driversJson.data?.[0]?.id;
    expect(driverId).toBeTruthy();
    const vehicleId = driversJson.data?.[0]?.default_vehicle?.id;

    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + 3);

    const createRes = await request.post(`${base}/api/trips`, {
      headers: {
        Authorization: `Bearer ${clientToken}`,
        "Content-Type": "application/json"
      },
      data: {
        client_id: PILOT_STAGING_CLIENT_ID,
        service_type: "E2E Despacho Agenda",
        scheduled_at: scheduled.toISOString(),
        origin_text: "Origem E2E Despacho",
        destination_text: "Destino E2E Despacho",
        passenger_name: "Playwright Despacho",
        dispatch_mode: "directed"
      }
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as { success?: boolean; data?: { id: string } };
    const tripId = created.data?.id;
    expect(tripId).toBeTruthy();

    const approveRes = await request.post(`${base}/api/trips/${tripId}/approve`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    expect(approveRes.ok()).toBeTruthy();

    const claimRes = await request.post(`${base}/api/trips/${tripId}/operational-claim`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    if (!claimRes.ok()) {
      const claimJson = await claimRes.json();
      const code = (claimJson as { error?: { code?: string } }).error?.code;
      expect(code).not.toBe("CLAIM_NOT_OWNER");
    }

    const dispatchPayload: Record<string, string> = { driver_id: driverId! };
    if (vehicleId) dispatchPayload.vehicle_id = vehicleId;

    const dispatchRes = await request.post(`${base}/api/trips/${tripId}/dispatch-directed`, {
      headers: {
        Authorization: `Bearer ${operadorToken}`,
        "Content-Type": "application/json"
      },
      data: dispatchPayload
    });
    expect(dispatchRes.ok()).toBeTruthy();
    const dispatched = (await dispatchRes.json()) as {
      success?: boolean;
      data?: { operational_status: string; driver_id?: string };
    };
    expect(dispatched.data?.operational_status).toBe("dispatched");
    expect(dispatched.data?.driver_id).toBe(driverId);

    const acceptRes = await request.post(`${base}/api/trips/${tripId}/status`, {
      headers: {
        Authorization: `Bearer ${motoristaToken}`,
        "Content-Type": "application/json"
      },
      data: { to_status: "accepted" }
    });
    expect(acceptRes.ok()).toBeTruthy();
    const accepted = (await acceptRes.json()) as { data?: { operational_status: string } };
    expect(accepted.data?.operational_status).toBe("accepted");

    const listRes = await request.get(`${base}/api/trips?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    const listJson = (await listRes.json()) as {
      data?: { items: { id: string; operational_status: string }[] };
    };
    const row = listJson.data?.items?.find((t) => t.id === tripId);
    expect(row?.operational_status).toBe("accepted");
  });

  test("API: reatribuir motorista após despacho", async ({ request }) => {
    const config = getStagingAuthConfig()!;
    const base = config.baseUrl;

    const operadorToken = await signInStaging({
      ...config,
      role: "operador",
      email: stagingEmailByRole.operador
    });

    const driversRes = await request.get(`${base}/api/drivers`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    const driversJson = (await driversRes.json()) as {
      data?: { id: string; default_vehicle?: { id: string } | null }[];
    };
    const drivers = driversJson.data ?? [];
    if (drivers.length < 2) {
      test.skip(true, "Staging precisa de pelo menos 2 motoristas para testar reassign");
      return;
    }

    const tripsRes = await request.get(`${base}/api/trips?page=1&pageSize=20&status=dispatched`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    const tripsJson = (await tripsRes.json()) as { data?: { items: { id: string; driver_id?: string }[] } };
    const trip = tripsJson.data?.items?.find((t) => t.driver_id);
    if (!trip?.driver_id) {
      test.skip(true, "Sem corrida dispatched com motorista em staging");
      return;
    }

    const newDriver = drivers.find((d) => d.id !== trip.driver_id);
    if (!newDriver) {
      test.skip(true, "Sem segundo motorista disponível");
      return;
    }

    await request.post(`${base}/api/trips/${trip.id}/operational-claim`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });

    const reassignRes = await request.post(`${base}/api/trips/${trip.id}/reassign`, {
      headers: {
        Authorization: `Bearer ${operadorToken}`,
        "Content-Type": "application/json"
      },
      data: {
        new_driver_id: newDriver.id,
        reason: "E2E reassign Playwright",
        ...(newDriver.default_vehicle?.id ? { vehicle_id: newDriver.default_vehicle.id } : {})
      }
    });
    expect(reassignRes.ok()).toBeTruthy();
    const body = (await reassignRes.json()) as { data?: { driver_id: string; operational_status: string } };
    expect(body.data?.driver_id).toBe(newDriver.id);
    expect(body.data?.operational_status).toBe("dispatched");
  });

  test("UI: operador abre agenda e vê painel de despacho", async ({ page }) => {
    const config = getStagingAuthConfig()!;
    const operadorToken = await signInStaging({
      ...config,
      role: "operador",
      email: stagingEmailByRole.operador
    });

    const tripsRes = await page.request.get(`${config.baseUrl}/api/trips?page=1&pageSize=5&status=approved`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    if (!tripsRes.ok()) {
      test.skip(true, "Sem viagens approved em staging para UI");
      return;
    }
    const tripsJson = (await tripsRes.json()) as { data?: { items: { id: string }[] } };
    const tripId = tripsJson.data?.items?.[0]?.id;
    if (!tripId) {
      test.skip(true, "Sem viagens approved em staging");
      return;
    }

    await page.goto("/login?next=/agenda");
    await page.getByLabel("Email").fill(stagingEmailByRole.operador);
    await page.getByLabel("Senha").fill(config.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/agenda/, { timeout: 30_000 });

    await page.goto(`/agenda?trip=${tripId}`);
    await expect(page.getByText("Despacho direcionado").or(page.getByText("Atribuição"))).toBeVisible({
      timeout: 15_000
    });
  });
});
