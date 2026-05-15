import { DEFAULT_TENANT_ID } from "../../src/lib/tenant/default-tenant";

export const PILOT_STAGING_CLIENT_ID = "c1000000-0000-4000-8000-000000000001";
export const PILOT_STAGING_TENANT_ID = DEFAULT_TENANT_ID;
export const PILOT_MOCK_TRIP_REQUESTED_ID = "c2000000-0000-4000-8000-000000000099";
export const PILOT_MOCK_TRIP_APPROVED_ID = "c2000000-0000-4000-8000-000000000002";
export const PILOT_MOCK_DRIVER_ID = "d1000000-0000-4000-8000-000000000001";
export const PILOT_MOCK_VEHICLE_ID = "v1000000-0000-4000-8000-000000000001";
export const PILOT_OPERADOR_USER_ID = "b1000000-0000-4000-8000-000000000001";
export const PILOT_MOTORISTA_USER_ID = "b1000000-0000-4000-8000-000000000002";

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

export function mockApprovedTrip() {
  const scheduled = new Date();
  scheduled.setDate(scheduled.getDate() + 2);
  return {
    id: PILOT_MOCK_TRIP_APPROVED_ID,
    tenant_id: PILOT_STAGING_TENANT_ID,
    client_id: PILOT_STAGING_CLIENT_ID,
    scheduled_at: scheduled.toISOString(),
    operational_status: "approved" as const,
    financial_status: "pending" as const,
    service_type: "Transfer executivo",
    origin_text: "Hotel staging",
    destination_text: "Aeroporto Vitória",
    passenger_name: "Convidado E2E",
    dispatch_mode: "directed" as const
  };
}

export function mockDispatchedTrip(driverId = PILOT_MOCK_DRIVER_ID, vehicleId = PILOT_MOCK_VEHICLE_ID) {
  return {
    ...mockApprovedTrip(),
    operational_status: "dispatched" as const,
    driver_id: driverId,
    vehicle_id: vehicleId,
    vehicle: { id: vehicleId, plate: "ABC1D23", model: "Corolla E2E" }
  };
}

export function mockDriversList() {
  return [
    {
      id: PILOT_MOCK_DRIVER_ID,
      profile_id: PILOT_MOTORISTA_USER_ID,
      cpf: "52998224725",
      profile_name: "Motorista E2E",
      default_vehicle: { id: PILOT_MOCK_VEHICLE_ID, plate: "ABC1D23", model: "Corolla E2E" }
    }
  ];
}

export function mockVehiclesList() {
  return [{ id: PILOT_MOCK_VEHICLE_ID, plate: "ABC1D23", model: "Corolla E2E", active: true }];
}

export function pilotOperadorHeaders(userId = PILOT_OPERADOR_USER_ID) {
  return {
    "x-role": "operador",
    "x-user-id": userId,
    "x-tenant-id": PILOT_STAGING_TENANT_ID
  };
}

export function pilotMotoristaHeaders(userId = PILOT_MOTORISTA_USER_ID, driverId = PILOT_MOCK_DRIVER_ID) {
  return {
    "x-role": "motorista",
    "x-user-id": userId,
    "x-driver-id": driverId,
    "x-tenant-id": PILOT_STAGING_TENANT_ID
  };
}
