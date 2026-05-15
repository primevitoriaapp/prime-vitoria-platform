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
    }
  | {
      kind: "status";
      id: string;
      at: string;
      from_status: string | null;
      to_status: string;
      changed_by: string | null;
      source: string | null;
    }
  | {
      kind: "claim";
      id: string;
      at: string;
      action: "assumed" | "released";
      operator_profile_id: string;
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

    const statusQuery = db
      .from("trip_status_history")
      .select("id, from_status, to_status, changed_by, source, changed_at")
      .eq("trip_id", tripId)
      .order("changed_at", { ascending: false })
      .limit(150);

    const claimsQuery = includeInternalNotes
      ? db
          .from("trip_operational_claims")
          .select("id, operator_profile_id, claimed_at, released_at")
          .eq("trip_id", tripId)
          .eq("tenant_id", tenantId)
          .order("claimed_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as const, error: null });

    const [{ data: audits, error: aErr }, { data: notes, error: nErr }, { data: statuses, error: sErr }, { data: claims, error: cErr }] =
      await Promise.all([auditQuery, notesQuery, statusQuery, claimsQuery]);

    if (aErr) return fail("TIMELINE_AUDIT_FAILED", aErr.message, 500);
    if (nErr) return fail("TIMELINE_NOTES_FAILED", nErr.message, 500);
    if (sErr) return fail("TIMELINE_STATUS_FAILED", sErr.message, 500);
    if (cErr) return fail("TIMELINE_CLAIMS_FAILED", cErr.message, 500);

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

    const claimEntries: TimelineEntry[] = [];
    for (const row of claims ?? []) {
      claimEntries.push({
        kind: "claim",
        id: `c-${row.id}-a`,
        at: row.claimed_at as string,
        action: "assumed",
        operator_profile_id: row.operator_profile_id as string
      });
      if (row.released_at) {
        claimEntries.push({
          kind: "claim",
          id: `c-${row.id}-r`,
          at: row.released_at as string,
          action: "released",
          operator_profile_id: row.operator_profile_id as string
        });
      }
    }

    const statusEntries: TimelineEntry[] = (statuses ?? []).map((row) => ({
      kind: "status" as const,
      id: `s-${row.id}`,
      at: row.changed_at as string,
      from_status: (row.from_status as string | null) ?? null,
      to_status: row.to_status as string,
      changed_by: (row.changed_by as string | null) ?? null,
      source: (row.source as string | null) ?? null
    }));

    const merged = [...auditEntries, ...noteEntries, ...statusEntries, ...claimEntries].sort((x, y) =>
      x.at < y.at ? 1 : x.at > y.at ? -1 : 0
    );

    return ok({ trip_id: tripId, items: merged });
  } catch (error) {
    return mapApiError(error);
  }
}
