import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { loadTripForPassengerList } from "@/lib/trips/passenger-list-access";
import { parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";
import { reorderStops } from "@/lib/trips/stop-order";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { pushToStaff } from "@/lib/push/web-push";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";

const bodySchema = z.object({ order: z.array(z.coerce.number().int().min(0)).min(2).max(30), suggested: z.boolean().optional() });
const CLOSED = ["completed", "cancelled", "rejected", "no_show"];

/** Motorista (ou central) troca a ordem das paradas ainda não feitas. A última vira o destino final. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForPassengerList(id);
    if (!r.ok) return fail("FORBIDDEN", r.message, r.status);
    if (CLOSED.includes(r.trip.operational_status)) return fail("TRIP_CLOSED", "A corrida já terminou.", 409);
    const { order, suggested } = bodySchema.parse(await request.json());
    const stops = parseDropoffStops(r.trip.trip_dropoff_stops);
    const next = reorderStops(stops, order);
    if (!next) return fail("INVALID_ORDER", "Ordem inválida. Atualize a tela e tente de novo.", 409);
    const last = next[next.length - 1];
    const finalChanged = stops.some((s) => s.final);
    const { error } = await db
      .from("trips")
      .update({
        trip_dropoff_stops: next,
        ...(finalChanged ? { destination_text: last.address_text, destination_lat: last.lat ?? null, destination_lng: last.lng ?? null } : {})
      })
      .eq("id", id)
      .eq("tenant_id", r.tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);

    const session = await getSessionContext();
    const names = next.filter((s) => !s.dropped_at).map((s) => s.passenger_name?.split(" ")[0] || "parada").join(" → ");
    await insertAuditEvent({ tenantId: r.tenantId, actorUserId: session.userId, action: "trip.dropoff_reorder", entityType: "trip", entityId: id, metadata: { order: names, suggested: Boolean(suggested) }, request });
    if (r.role === "motorista") {
      await pushToStaff(r.tenantId, {
        title: "🔀 Motorista trocou a ordem das paradas",
        body: `${names}${suggested ? " (sugestão de rota mais curta)" : ""}`,
        url: `${OFFICIAL_URLS.central}/agenda`,
        tag: `reorder-${id}`
      }).catch(() => 0);
    }
    return ok({ stops: next });
  } catch (e) {
    return mapApiError(e);
  }
}
