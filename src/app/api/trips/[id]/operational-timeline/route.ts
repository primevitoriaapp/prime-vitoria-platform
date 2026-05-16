import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { can } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { resolveProfileNames } from "@/lib/profiles/resolve-profile-names";
import { auditActionMatchesPrefix, uniqueAuditRowsById } from "@/lib/trips/timeline-audit-filter";
import { notificationPayloadTripId } from "@/lib/trips/timeline-notification";

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
    }
  | {
      kind: "notification";
      id: string;
      at: string;
      event_type: string;
      channel: string;
      recipient_type: string;
      recipient_id: string | null;
      status: string;
      correlation_id: string;
      last_error: string | null;
    };

/** Histórico operacional: auditoria da viagem + notas internas, ordenado por tempo (mais recente primeiro). Query opcional `audit_prefix` (ex. `finance.`) limita linhas `kind=audit` por prefixo de `action`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    const auditPrefixRaw = url.searchParams.get("audit_prefix")?.trim() ?? "";
    const auditPrefix = auditPrefixRaw.length > 0 ? auditPrefixRaw.slice(0, 80) : null;

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

    const [payablesResult, receivablesResult, offersResult] = await Promise.all([
      db.from("driver_payables").select("id").eq("tenant_id", tenantId).eq("trip_id", tripId).limit(50),
      db.from("accounts_receivable").select("id").eq("tenant_id", tenantId).eq("trip_id", tripId).limit(50),
      db.from("dispatch_offers").select("id").eq("tenant_id", tenantId).eq("trip_id", tripId).limit(50)
    ]);

    const payableIds = (payablesResult.data ?? []).map((row) => row.id as string).filter(Boolean);
    const receivableIds = (receivablesResult.data ?? []).map((row) => row.id as string).filter(Boolean);
    const offerIds = (offersResult.data ?? []).map((row) => row.id as string).filter(Boolean);

    const auditQuery = db
      .from("audit_events")
      .select("id, action, actor_user_id, metadata, created_at")
      .eq("tenant_id", tenantId)
      .eq("entity_type", "trip")
      .eq("entity_id", tripId)
      .order("created_at", { ascending: false })
      .limit(150);

    const relatedMetadataAuditQuery = db
      .from("audit_events")
      .select("id, action, actor_user_id, metadata, created_at")
      .eq("tenant_id", tenantId)
      .contains("metadata", { trip_id: tripId })
      .order("created_at", { ascending: false })
      .limit(150);

    const payableAuditQuery =
      payableIds.length > 0
        ? db
            .from("audit_events")
            .select("id, action, actor_user_id, metadata, created_at")
            .eq("tenant_id", tenantId)
            .eq("entity_type", "driver_payable")
            .in("entity_id", payableIds)
            .order("created_at", { ascending: false })
            .limit(150)
        : Promise.resolve({ data: [] as const, error: null });

    const receivableAuditQuery =
      receivableIds.length > 0
        ? db
            .from("audit_events")
            .select("id, action, actor_user_id, metadata, created_at")
            .eq("tenant_id", tenantId)
            .eq("entity_type", "accounts_receivable")
            .in("entity_id", receivableIds)
            .order("created_at", { ascending: false })
            .limit(150)
        : Promise.resolve({ data: [] as const, error: null });

    const offerAuditQuery =
      offerIds.length > 0
        ? db
            .from("audit_events")
            .select("id, action, actor_user_id, metadata, created_at")
            .eq("tenant_id", tenantId)
            .eq("entity_type", "dispatch_offer")
            .in("entity_id", offerIds)
            .order("created_at", { ascending: false })
            .limit(150)
        : Promise.resolve({ data: [] as const, error: null });

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

    const notificationsQuery = db
      .from("notification_jobs")
      .select("id, payload, status, correlation_id, last_error, created_at")
      .eq("tenant_id", tenantId)
      .contains("payload", { tripId })
      .order("created_at", { ascending: false })
      .limit(100);

    const [
      { data: audits, error: aErr },
      { data: relatedMetadataAudits, error: relMetaErr },
      { data: payableAudits, error: payAuditErr },
      { data: receivableAudits, error: recvAuditErr },
      { data: offerAudits, error: offerAuditErr },
      { data: notes, error: nErr },
      { data: statuses, error: sErr },
      { data: claims, error: cErr },
      { data: notifications, error: notifErr }
    ] = await Promise.all([
      auditQuery,
      relatedMetadataAuditQuery,
      payableAuditQuery,
      receivableAuditQuery,
      offerAuditQuery,
      notesQuery,
      statusQuery,
      claimsQuery,
      notificationsQuery
    ]);

    if (aErr) return fail("TIMELINE_AUDIT_FAILED", aErr.message, 500);
    if (relMetaErr) return fail("TIMELINE_RELATED_AUDIT_FAILED", relMetaErr.message, 500);
    if (payAuditErr) return fail("TIMELINE_PAYABLE_AUDIT_FAILED", payAuditErr.message, 500);
    if (recvAuditErr) return fail("TIMELINE_RECEIVABLE_AUDIT_FAILED", recvAuditErr.message, 500);
    if (offerAuditErr) return fail("TIMELINE_OFFER_AUDIT_FAILED", offerAuditErr.message, 500);
    if (nErr) return fail("TIMELINE_NOTES_FAILED", nErr.message, 500);
    if (sErr) return fail("TIMELINE_STATUS_FAILED", sErr.message, 500);
    if (cErr) return fail("TIMELINE_CLAIMS_FAILED", cErr.message, 500);
    if (notifErr) return fail("TIMELINE_NOTIFICATIONS_FAILED", notifErr.message, 500);

    const allAuditRows = uniqueAuditRowsById([
      ...(audits ?? []),
      ...(relatedMetadataAudits ?? []),
      ...(payableAudits ?? []),
      ...(receivableAudits ?? []),
      ...(offerAudits ?? [])
    ]);

    const auditEntries: TimelineEntry[] = allAuditRows
      .filter((row) => auditActionMatchesPrefix(String(row.action ?? ""), auditPrefix))
      .map((row) => ({
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

    const notificationEntries: TimelineEntry[] = (notifications ?? [])
      .filter((row) => notificationPayloadTripId((row.payload as Record<string, unknown> | null) ?? null) === tripId)
      .map((row) => {
        const payload = (row.payload as Record<string, unknown> | null) ?? {};
        return {
          kind: "notification" as const,
          id: `j-${row.id}`,
          at: row.created_at as string,
          event_type: typeof payload.eventType === "string" ? payload.eventType : "notification",
          channel: typeof payload.channel === "string" ? payload.channel : "unknown",
          recipient_type: typeof payload.recipientType === "string" ? payload.recipientType : "unknown",
          recipient_id: typeof payload.recipientId === "string" ? payload.recipientId : null,
          status: row.status as string,
          correlation_id: row.correlation_id as string,
          last_error: (row.last_error as string | null) ?? null
        };
      });

    const merged = [...auditEntries, ...noteEntries, ...statusEntries, ...claimEntries, ...notificationEntries].sort(
      (x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)
    );

    const profileIds: string[] = [];
    for (const e of merged) {
      if (e.kind === "audit" && e.actor_user_id) profileIds.push(e.actor_user_id);
      if (e.kind === "note") profileIds.push(e.author_profile_id);
      if (e.kind === "status" && e.changed_by) profileIds.push(e.changed_by);
      if (e.kind === "claim") profileIds.push(e.operator_profile_id);
    }
    const profile_names = await resolveProfileNames(profileIds);

    return ok({ trip_id: tripId, items: merged, profile_names, audit_prefix: auditPrefix });
  } catch (error) {
    return mapApiError(error);
  }
}
