import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { normalizePublicTrackToken } from "@/lib/public/track-token";
import { pushToStaff } from "@/lib/push/web-push";

const bodySchema = z.object({ stars: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(800).optional() });

/** Passageiro avalia a viagem pelo mesmo link do acompanhamento (vale até 3 h depois do fim). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token: raw } = await params;
    const token = normalizePublicTrackToken(raw);
    if (!token) return fail("INVALID_TOKEN", "Link inválido", 400);
    const body = bodySchema.parse(await request.json());
    const { data: tok } = await db.from("trip_public_track_tokens").select("trip_id").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!tok) return fail("EXPIRED", "O prazo para avaliar esta viagem acabou.", 410);
    const { data: trip } = await db.from("trips").select("id, tenant_id, driver_id, client_id, operational_status, passenger_name").eq("id", tok.trip_id).maybeSingle();
    if (!trip || trip.operational_status !== "completed") return fail("NOT_FINISHED", "Avalie quando a viagem terminar.", 409);
    const { error } = await db.from("trip_ratings").insert({
      tenant_id: trip.tenant_id,
      trip_id: trip.id,
      driver_id: trip.driver_id,
      client_id: trip.client_id,
      stars: body.stars,
      comment: body.comment || null
    });
    if (error) return ok({ saved: true, already: true });
    if (body.stars <= 3) {
      await pushToStaff(trip.tenant_id as string, {
        title: `⚠️ Avaliação ${body.stars}★ de passageiro`,
        body: `${trip.passenger_name ?? "Passageiro"}${body.comment ? `: ${body.comment.slice(0, 120)}` : ""}`,
        url: `/agenda?trip=${trip.id}#trip-detail`,
        tag: `rating-${trip.id}`
      }).catch(() => 0);
    }
    return ok({ saved: true });
  } catch (error) {
    return mapApiError(error);
  }
}
