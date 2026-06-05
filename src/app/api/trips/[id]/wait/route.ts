import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { z } from "zod";

const WAIT_ALLOWED: string[] = ["on_the_way", "arrived", "in_progress"];

const bodySchema = z.object({
  action: z.enum(["start", "stop"])
});

function minutesBetween(startIso: string, end: Date): number {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return 0;
  const diffMs = Math.max(0, end.getTime() - start);
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

/** Inicia ou encerra contagem de espera do passageiro (app motorista). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    assertCapability(session, "trip.status");
    const tenantId = assertTenantScope(session);
    const driverId = session.driverId;
    const { id } = await params;
    const { action } = bodySchema.parse(await request.json());

    const { data: trip, error: loadErr } = await db
      .from("trips")
      .select("id, driver_id, operational_status, wait_minutes, wait_started_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (loadErr) return fail("TRIP_LOAD_FAILED", loadErr.message, 500);
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!driverId || trip.driver_id !== driverId) {
      return fail("FORBIDDEN", "Esta corrida não está atribuída a si", 403);
    }
    if (!WAIT_ALLOWED.includes(trip.operational_status)) {
      return fail(
        "INVALID_STATUS",
        "Espera só durante corrida activa (a caminho, no local ou em andamento).",
        400
      );
    }

    if (action === "start") {
      if (trip.wait_started_at) {
        return ok({ wait_started_at: trip.wait_started_at, wait_minutes: trip.wait_minutes ?? 0 });
      }
      const wait_started_at = new Date().toISOString();
      const { error } = await db.from("trips").update({ wait_started_at }).eq("id", id).eq("tenant_id", tenantId);
      if (error) {
        if (/wait_started_at|column/i.test(error.message)) {
          return fail(
            "SCHEMA_OUTDATED",
            "Campo de espera indisponível — aplique migration 0059_trip_wait_minutes.sql.",
            503
          );
        }
        return fail("WAIT_START_FAILED", error.message, 500);
      }
      return ok({ wait_started_at, wait_minutes: trip.wait_minutes ?? 0 });
    }

    const startedAt = trip.wait_started_at as string | null;
    if (!startedAt) {
      return ok({ wait_minutes: trip.wait_minutes ?? 0, wait_started_at: null });
    }

    const added = minutesBetween(startedAt, new Date());
    const wait_minutes = (trip.wait_minutes ?? 0) + added;
    const { error } = await db
      .from("trips")
      .update({ wait_minutes, wait_started_at: null })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      if (/wait_/i.test(error.message)) {
        return fail(
          "SCHEMA_OUTDATED",
          "Campo de espera indisponível — aplique migration 0059_trip_wait_minutes.sql.",
          503
        );
      }
      return fail("WAIT_STOP_FAILED", error.message, 500);
    }

    return ok({ wait_minutes, wait_started_at: null, added_minutes: added });
  } catch (error) {
    return mapApiError(error);
  }
}
