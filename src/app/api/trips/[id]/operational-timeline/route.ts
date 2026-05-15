import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { can } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";

export type TimelineEntry =
  | {
      kind: "audit";
      id: string;
      at: string;
      action: string;
      actor_user_id: string | null;
      metadata: Record<string, unknown>;
    }
  | {
      kind: "note";
      id: number;
      at: string;
      author_profile_id: string;
      body: string;
    };

/** Histórico operacional: auditoria da viagem + notas internas, ordenado por tempo (mais recente primeiro). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!can(session, "trip.read")) {
      return fail("FORBIDDEN", "Histórico operacional requer visão global de viagens", 403);
    }
    const includeInternalNotes = session.role === "admin" || session.role === "operador";
    if (!includeInternalNotes && session.role !== "financeiro") {
      return fail("FORBIDDEN", "Histórico operacional não disponível para este perfil", 403);
    }

    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const { data: trip, error: tripErr } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id")
      .eq("id", tripId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (tripErr || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const auditQuery = db
      .from("audit_events")
      .select("id, action, actor_user_id, metadata, created_at")
      .eq("tenant_id", tenantId)
      .eq("entity_type", "trip")
      .eq("entity_id", tripId)
      .order("created_at", { ascending: false })
      .limit(150);

    const notesQuery = includeInternalNotes
      ? db
          .from("trip_operator_notes")
          .select("id, author_profile_id, body, created_at")
          .eq("tenant_id", tenantId)
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false })
          .limit(150)
      : Promise.resolve({ data: [] as const, error: null });

    const [{ data: audits, error: aErr }, { data: notes, error: nErr }] = await Promise.all([auditQuery, notesQuery]);

    if (aErr) return fail("TIMELINE_AUDIT_FAILED", aErr.message, 500);
    if (nErr) return fail("TIMELINE_NOTES_FAILED", nErr.message, 500);

    const auditEntries: TimelineEntry[] = (audits ?? []).map((row) => ({
      kind: "audit" as const,
      id: `a-${row.id}`,
      at: row.created_at as string,
      action: row.action as string,
      actor_user_id: (row.actor_user_id as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {}
    }));

    const noteEntries: TimelineEntry[] = (notes ?? []).map((row) => ({
      kind: "note" as const,
      id: row.id as number,
      at: row.created_at as string,
      author_profile_id: row.author_profile_id as string,
      body: row.body as string
    }));

    const merged = [...auditEntries, ...noteEntries].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

    return ok({ trip_id: tripId, items: merged });
  } catch (error) {
    return mapApiError(error);
  }
}
