import type { SessionContext } from "../domain/types";
import { can } from "../security/rbac.ts";

function accessDeniedResponse(code: string, message: string, status: number) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export type TripGetAccess =
  | "allow"
  | "not_found"
  | "scope_required_client"
  | "scope_required_driver"
  | "no_capability";

export function tripGetAccess(
  session: SessionContext,
  trip: { client_id: string; driver_id: string | null }
): TripGetAccess {
  if (can(session, "trip.read")) return "allow";

  if (can(session, "trip.read.own")) {
    if (!session.clientId) return "scope_required_client";
    if (trip.client_id !== session.clientId) return "not_found";
    return "allow";
  }

  if (can(session, "trip.read.assigned")) {
    if (!session.driverId) return "scope_required_driver";
    if (trip.driver_id !== session.driverId) return "not_found";
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
