import type { SessionContext } from "../domain/types";
import { can } from "../security/rbac.ts";

/** Igual a `src/lib/tenant/default-tenant.ts` (evita import sem extensão no `node --test`). */
const DEFAULT_TENANT_ID = "a0000000-0000-0000-0000-000000000001";

function accessDeniedResponse(code: string, message: string, status: number) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function sessionTenantId(session: SessionContext): string {
  if (session.role === "guest") return DEFAULT_TENANT_ID;
  return session.tenantId ?? DEFAULT_TENANT_ID;
}

export type TripGetAccess =
  | "allow"
  | "not_found"
  | "scope_required_client"
  | "scope_required_driver"
  | "no_capability";

export function tripGetAccess(
  session: SessionContext,
  trip: { client_id: string; driver_id: string | null; tenant_id?: string },
  resolvedDriverId?: string | null
): TripGetAccess {
  if (trip.tenant_id && trip.tenant_id !== sessionTenantId(session)) {
    return "not_found";
  }

  if (can(session, "trip.read")) return "allow";

  if (can(session, "trip.read.own")) {
    if (!session.clientId) return "scope_required_client";
    if (trip.client_id !== session.clientId) return "not_found";
    return "allow";
  }

  if (can(session, "trip.read.assigned")) {
    const driverId = resolvedDriverId ?? session.driverId;
    if (!driverId) return "scope_required_driver";
    if (trip.driver_id !== driverId) return "not_found";
    return "allow";
  }

  return "no_capability";
}

/** `null` se a viagem pode ser lida no contexto da sessao; senao JSON (mesmo formato que `fail()` em `http.ts`). */
export function denyUnlessTripReadable(access: TripGetAccess) {
  switch (access) {
    case "allow":
      return null;
    case "not_found":
      return accessDeniedResponse("TRIP_NOT_FOUND", "Trip not found", 404);
    case "scope_required_client":
      return accessDeniedResponse("FORBIDDEN", "Cliente precisa de escopo de cliente (x-client-id ou perfil)", 403);
    case "scope_required_driver":
      return accessDeniedResponse("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);
    case "no_capability":
      return accessDeniedResponse("FORBIDDEN", "Sem permissao para acessar esta viagem", 403);
  }
}
