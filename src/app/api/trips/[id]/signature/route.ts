import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadTripForActor } from "@/lib/trips/trip-actor";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.union([
  z.object({
    signer_name: z.string().trim().min(2).max(120),
    image_data: z.string().startsWith("data:image/png;base64,").max(400_000)
  }),
  z.object({ skipped_reason: z.string().trim().min(3).max(300) })
]);

async function context(id: string) {
  const r = await loadTripForActor(id, "operational_status, passenger_name, odometer_start, odometer_end, actual_km, km_source");
  if (!r.ok) return r;
  const [{ data: client }, { data: sig }] = await Promise.all([
    db.from("clients").select("type").eq("id", r.trip.client_id as string).maybeSingle(),
    db.from("trip_signatures").select("signer_name, image_data, skipped_reason, created_at").eq("trip_id", id).maybeSingle()
  ]);
  return { ...r, required: client?.type === "PJ", signature: sig ?? null };
}

/** Assinatura do passageiro (corridas de empresa): documenta que o serviço foi feito. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const c = await context(id);
    if (!c.ok) return fail("FORBIDDEN", "Sem acesso a esta corrida", c.error === "notfound" ? 404 : 403);
    return ok({
      required: c.required,
      signature: c.signature,
      passenger_name: c.trip.passenger_name ?? null,
      odometer_start: c.trip.odometer_start ?? null,
      odometer_end: c.trip.odometer_end ?? null,
      actual_km: c.trip.actual_km ?? null,
      km_source: c.trip.km_source ?? null,
      rating: (await db.from("trip_ratings").select("stars, comment, created_at").eq("trip_id", id).maybeSingle()).data ?? null
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const c = await context(id);
    if (!c.ok) return fail("FORBIDDEN", "Sem acesso a esta corrida", c.error === "notfound" ? 404 : 403);
    if (!c.isDriver && !c.isStaff) return fail("FORBIDDEN", "Sem acesso", 403);
    if (!["arrived", "in_progress", "completed"].includes(String(c.trip.operational_status))) {
      return fail("INVALID_STATUS", "A assinatura é colhida no fim da corrida", 409);
    }
    const body = bodySchema.parse(await request.json());
    const row = {
      tenant_id: c.tenantId,
      trip_id: id,
      driver_id: (c.trip.driver_id as string | null) ?? null,
      signer_name: "signer_name" in body ? body.signer_name : null,
      image_data: "image_data" in body ? body.image_data : null,
      skipped_reason: "skipped_reason" in body ? body.skipped_reason : null,
      created_at: new Date().toISOString()
    };
    const { error } = await db.from("trip_signatures").upsert(row, { onConflict: "trip_id" });
    if (error) return fail("SIGNATURE_SAVE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId: c.tenantId,
      actorUserId: c.session.userId,
      action: row.image_data ? "trip.signature" : "trip.signature_skipped",
      entityType: "trip",
      entityId: id,
      metadata: row.skipped_reason ? { reason: row.skipped_reason } : { signer: row.signer_name },
      request
    });
    return ok({ saved: true });
  } catch (error) {
    return mapApiError(error);
  }
}
