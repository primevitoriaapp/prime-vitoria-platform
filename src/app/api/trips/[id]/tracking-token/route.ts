import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  expires_in_hours: z.number().int().min(1).max(720).optional()
});

function newTrackToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const { id } = await params;
    const tenantId = assertTenantScope(session);

    const { data: trip, error: tripErr } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (tripErr || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const hours = body.expires_in_hours ?? 168;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = newTrackToken();
      const { data, error } = await db
        .from("trip_public_track_tokens")
        .insert({ trip_id: id, token, expires_at: expiresAt })
        .select("token, expires_at")
        .single();

      if (!error && data) {
        await insertAuditEvent({
          tenantId,
          actorUserId: session.userId,
          action: "trip.tracking_token_create",
          entityType: "trip",
          entityId: id,
          metadata: { expires_at: data.expires_at },
          request
        });
        return ok({
          token: data.token,
          path: `/r/${encodeURIComponent(data.token)}`,
          expires_at: data.expires_at
        });
      }
      if (error && isPostgresUniqueViolation(error)) {
        lastError = new Error("token collision");
        continue;
      }
      if (error) return fail("TRACK_TOKEN_CREATE_FAILED", error.message, 500);
    }

    return fail("TRACK_TOKEN_CREATE_FAILED", lastError?.message ?? "Could not allocate token", 500);
  } catch (error) {
    return mapApiError(error);
  }
}
