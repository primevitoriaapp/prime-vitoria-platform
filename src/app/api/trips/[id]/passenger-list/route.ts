import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { loadTripForPassengerList } from "@/lib/trips/passenger-list-access";
import { parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";

const CLOSED = ["completed", "cancelled", "rejected", "no_show"];

type Boarded = { passenger_id: string | null; passenger_name: string };

function parseBoarded(raw: unknown): Boarded[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({ passenger_id: (x as Boarded)?.passenger_id ?? null, passenger_name: String((x as Boarded)?.passenger_name ?? "").trim() }))
    .filter((x) => x.passenger_name.length > 0);
}

/** "Marlene, Vivian e Suzana" para o campo de passageiro da corrida. */
function summary(list: Boarded[]): string {
  if (list.length <= 1) return list[0]?.passenger_name ?? "";
  const names = list.map((p) => p.passenger_name.split(/\s+/)[0]);
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * Lista de funcionários da empresa para o motorista marcar quem embarcou.
 * Só registra quem embarcou: a rota (embarque, paradas e destino) continua a cadastrada.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForPassengerList(id);
    if (!r.ok) return fail("FORBIDDEN", r.message, r.status);
    const { data: client } = await db.from("clients").select("requires_passenger_list").eq("id", r.trip.client_id).maybeSingle();
    const required = client?.requires_passenger_list === true;
    const { data: roster } = await db
      .from("client_passengers")
      .select("id, name")
      .eq("client_id", r.trip.client_id)
      .eq("active", true)
      .order("name")
      .limit(500);
    let boarded = parseBoarded(r.trip.boarded_passengers);
    const saved = boarded.length > 0;
    // Primeira vez: já vem marcado quem está na corrida (nome do passageiro e das paradas).
    if (!boarded.length) {
      const names = [r.trip.passenger_name, ...parseDropoffStops(r.trip.trip_dropoff_stops).map((s) => s.passenger_name)]
        .flatMap((n) => String(n ?? "").split(/,| e /))
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n.length > 1);
      boarded = (roster ?? [])
        .filter((p) => {
          const full = String(p.name).toLowerCase();
          return names.some((n) => full === n || full.startsWith(`${n} `));
        })
        .map((p) => ({ passenger_id: p.id as string, passenger_name: p.name as string }));
    }
    return ok({
      required,
      roster: (roster ?? []).map((p) => ({ id: p.id as string, name: p.name as string })),
      boarded,
      saved
    });
  } catch (e) {
    return mapApiError(e);
  }
}

const bodySchema = z.object({
  passengers: z
    .array(z.object({ passenger_id: z.string().uuid().nullable().optional(), passenger_name: z.string().trim().min(1).max(120) }))
    .min(1)
    .max(40)
});

/** Salva quem embarcou. Não mexe nas paradas da corrida. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForPassengerList(id);
    if (!r.ok) return fail("FORBIDDEN", r.message, r.status);
    if (CLOSED.includes(r.trip.operational_status)) return fail("TRIP_CLOSED", "Corrida já encerrada.", 409);
    const body = bodySchema.parse(await request.json());
    const list: Boarded[] = body.passengers.map((p) => ({ passenger_id: p.passenger_id ?? null, passenger_name: p.passenger_name }));
    const { error } = await db
      .from("trips")
      .update({ boarded_passengers: list, passenger_count: list.length, passenger_name: summary(list) })
      .eq("id", id)
      .eq("tenant_id", r.tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId: r.tenantId,
      actorUserId: null,
      action: "trip.passenger_list",
      entityType: "trip",
      entityId: id,
      metadata: { by: r.role, passengers: list.map((s) => s.passenger_name) }
    }).catch(() => undefined);
    return ok({ boarded: list });
  } catch (e) {
    return mapApiError(e);
  }
}
