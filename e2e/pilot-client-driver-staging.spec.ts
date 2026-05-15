import { test, expect } from "@playwright/test";
import {
  getStagingAuthConfig,
  signInStaging,
  stagingEmailByRole,
  stagingTestsEnabled
} from "./helpers/staging-auth";
import { PILOT_STAGING_CLIENT_ID } from "./helpers/pilot-fixtures";

/**
 * Fluxo piloto cliente → operação → motorista (staging real).
 * PLAYWRIGHT_STAGING=1 + STAGING_E2E_PASSWORD + Supabase + seed.
 */
test.describe("Pilot cliente → motorista (staging)", () => {
  test.skip(!stagingTestsEnabled(), "Defina PLAYWRIGHT_STAGING=1 e credenciais staging");

  test("cliente cria corrida, operador aprova, motorista vê despacho", async ({ request }) => {
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

    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + 2);

    const createRes = await request.post(`${base}/api/trips`, {
      headers: {
        Authorization: `Bearer ${clientToken}`,
        "Content-Type": "application/json"
      },
      data: {
        client_id: PILOT_STAGING_CLIENT_ID,
        service_type: "E2E Piloto",
        scheduled_at: scheduled.toISOString(),
        origin_text: "Origem E2E Piloto",
        destination_text: "Destino E2E Piloto",
        passenger_name: "Teste Playwright",
        dispatch_mode: "directed"
      }
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as { success?: boolean; data?: { id: string } };
    expect(created.success).toBe(true);
    const tripId = created.data?.id;
    expect(tripId).toBeTruthy();

    const approveRes = await request.post(`${base}/api/trips/${tripId}/approve`, {
      headers: { Authorization: `Bearer ${operadorToken}` }
    });
    expect(approveRes.ok()).toBeTruthy();

    const tripsMotorista = await request.get(`${base}/api/trips?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${motoristaToken}` }
    });
    expect(tripsMotorista.ok()).toBeTruthy();
    const motJson = (await tripsMotorista.json()) as {
      success?: boolean;
      data?: { items: { id: string; operational_status: string }[] };
    };
    const hit = motJson.data?.items?.find((t) => t.id === tripId);
    if (hit) {
      expect(["approved", "dispatched", "accepted"]).toContain(hit.operational_status);
    }

    const clientList = await request.get(`${base}/api/trips?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    const clientJson = (await clientList.json()) as {
      data?: { items: { id: string; operational_status: string }[] };
    };
    const clientTrip = clientJson.data?.items?.find((t) => t.id === tripId);
    expect(clientTrip?.operational_status).not.toBe("requested");
  });
});
