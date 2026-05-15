import { DEFAULT_TENANT_ID } from "../../src/lib/tenant/default-tenant";

export const PILOT_STAGING_CLIENT_ID = "c1000000-0000-4000-8000-000000000001";
export const PILOT_STAGING_TENANT_ID = DEFAULT_TENANT_ID;
export const PILOT_MOCK_TRIP_REQUESTED_ID = "c2000000-0000-4000-8000-000000000099";

export function mockRequestedTrip() {
  const scheduled = new Date();
  scheduled.setDate(scheduled.getDate() + 1);
  return {
    id: PILOT_MOCK_TRIP_REQUESTED_ID,
    tenant_id: PILOT_STAGING_TENANT_ID,
    client_id: PILOT_STAGING_CLIENT_ID,
    scheduled_at: scheduled.toISOString(),
    operational_status: "requested" as const,
    financial_status: "pending" as const,
    service_type: "Transfer executivo",
    origin_text: "Aeroporto Vitória",
    destination_text: "Praia do Canto",
    passenger_name: "Convidado E2E",
    dispatch_mode: "directed" as const
  };
}

export function pilotClienteHeaders(userId = "c1000000-0000-4000-8000-000000000099") {
  return {
    "x-role": "cliente",
    "x-client-id": PILOT_STAGING_CLIENT_ID,
    "x-user-id": userId,
    "x-tenant-id": PILOT_STAGING_TENANT_ID
  };
}
