import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import type { SessionContext } from "@/lib/domain/types";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";

const postSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

function assertOperationalNotesRole(session: SessionContext): void {
  if (session.role !== "admin" && session.role !== "operador") {
    throw new Error("Forbidden: notas operacionais reservadas a administradores e operadores");
  }
}

async function loadTripForAccess(tenantId: string, tripId: string) {
  const { data: trip, error } = await db
    .from("trips")
    .select("id, client_id, driver_id, tenant_id")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !trip) return { trip: null as null | { id: string; client_id: string; driver_id: string | null; tenant_id: string } };
  return { trip };
}

/** Notas internas da equipa operacional (multiatendimento). Exige visão global de viagens (`trip.read`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertOperationalNotesRole(session);
    if (!can(session, "trip.read")) {
      return fail("FORBIDDEN", "Notas operacionais apenas para equipa com visão global de viagens", 403);
    }
    assertCapability(session, "trip.read");
    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const { trip } = await loadTripForAccess(tenantId, tripId);
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const { data, error } = await db
      .from("trip_operator_notes")
      .select("id, author_profile_id, body, created_at")
      .eq("trip_id", tripId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) return fail("NOTES_LIST_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertOperationalNotesRole(session);
    assertCapability(session, "trip.write");
    if (!can(session, "trip.read")) {
      return fail("FORBIDDEN", "Apenas operadores com visão global podem registar notas operacionais", 403);
    }
    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;
    const body = postSchema.parse(await request.json());

    const { trip } = await loadTripForAccess(tenantId, tripId);
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const { data: row, error } = await db
      .from("trip_operator_notes")
      .insert({
        tenant_id: tenantId,
        trip_id: tripId,
        author_profile_id: session.userId,
        body: body.body
      })
      .select("id, author_profile_id, body, created_at")
      .single();

    if (error || !row) return fail("NOTE_CREATE_FAILED", error?.message ?? "Insert failed", 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.operator_note_create",
      entityType: "trip",
      entityId: tripId,
      metadata: { note_id: row.id },
      request
    });

    return ok(row, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
