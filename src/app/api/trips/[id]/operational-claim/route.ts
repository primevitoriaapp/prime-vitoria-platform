import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { operationalClaimAgeMinutes, operationalClaimIsStale } from "@/lib/trips/operational-claim-state";

async function loadTrip(tenantId: string, tripId: string) {
  const { data: trip, error } = await db
    .from("trips")
    .select("id, client_id, driver_id, tenant_id")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !trip) return null;
  return trip;
}

/** Reivindicação ativa (multiatendimento). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertOperationalClaimRole(session);
    if (!can(session, "trip.read")) return fail("FORBIDDEN", "Sem visão de viagens", 403);

    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const trip = await loadTrip(tenantId, tripId);
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const { data: claim } = await db
      .from("trip_operational_claims")
      .select("id, operator_profile_id, claimed_at")
      .eq("trip_id", tripId)
      .eq("tenant_id", tenantId)
      .is("released_at", null)
      .maybeSingle();

    let operator_name: string | null = null;
    if (claim?.operator_profile_id) {
      const { data: prof } = await db.from("profiles").select("name").eq("id", claim.operator_profile_id).maybeSingle();
      operator_name = prof?.name ?? null;
    }

    return ok({
      active: claim
        ? {
            ...claim,
            operator_name,
            age_minutes: operationalClaimAgeMinutes(claim.claimed_at as string),
            stale: operationalClaimIsStale(claim.claimed_at as string)
          }
        : null
    });
  } catch (error) {
    return mapApiError(error);
  }
}

function assertOperationalClaimRole(session: { role: string }): void {
  if (session.role !== "admin" && session.role !== "operador") {
    throw new Error("Forbidden: reivindicação operacional reservada a administradores e operadores");
  }
}

/** Assume atendimento desta viagem (exclusivo por corrida). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertOperationalClaimRole(session);
    assertCapability(session, "trip.write");
    if (!can(session, "trip.read")) return fail("FORBIDDEN", "Sem visão de viagens", 403);

    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const trip = await loadTrip(tenantId, tripId);
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const { data: existing } = await db
      .from("trip_operational_claims")
      .select("id, operator_profile_id, claimed_at")
      .eq("trip_id", tripId)
      .eq("tenant_id", tenantId)
      .is("released_at", null)
      .maybeSingle();

    if (existing) {
      if (existing.operator_profile_id === session.userId) {
        return ok({ claim: existing, already: true });
      }
      return fail("CLAIM_CONFLICT", "Outro operador já assumiu o atendimento desta viagem", 409);
    }

    const { data: row, error } = await db
      .from("trip_operational_claims")
      .insert({
        tenant_id: tenantId,
        trip_id: tripId,
        operator_profile_id: session.userId
      })
      .select("id, operator_profile_id, claimed_at")
      .single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("CLAIM_CONFLICT", "Reivindicação em conflito; atualize a página", 409);
      }
      return fail("CLAIM_CREATE_FAILED", error.message, 500);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.operational_claim",
      entityType: "trip",
      entityId: tripId,
      metadata: { claim_id: row.id },
      request
    });

    const { data: claimerProfile } = await db.from("profiles").select("name").eq("id", session.userId).maybeSingle();
    const { notifyOperationalClaimTaken } = await import("@/lib/notifications/operational-notify");
    await notifyOperationalClaimTaken(tenantId, tripId, session.userId, {
      claimer_name: (claimerProfile?.name as string | undefined) ?? undefined
    });

    return ok({ claim: row, already: false }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

/** Liberta atendimento (titular ou admin). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertOperationalClaimRole(session);
    assertCapability(session, "trip.write");
    if (!can(session, "trip.read")) return fail("FORBIDDEN", "Sem visão de viagens", 403);

    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const trip = await loadTrip(tenantId, tripId);
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const { data: active } = await db
      .from("trip_operational_claims")
      .select("id, operator_profile_id")
      .eq("trip_id", tripId)
      .eq("tenant_id", tenantId)
      .is("released_at", null)
      .maybeSingle();

    if (!active) {
      return ok({ released: false });
    }

    if (active.operator_profile_id !== session.userId && session.role !== "admin") {
      return fail("FORBIDDEN", "Apenas o titular da reivindicação ou administrador pode libertar", 403);
    }

    const now = new Date().toISOString();
    const { error } = await db.from("trip_operational_claims").update({ released_at: now }).eq("id", active.id);

    if (error) return fail("CLAIM_RELEASE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.operational_claim_release",
      entityType: "trip",
      entityId: tripId,
      metadata: { claim_id: active.id, released_operator_id: active.operator_profile_id },
      request
    });

    return ok({ released: true, claim_id: active.id });
  } catch (error) {
    return mapApiError(error);
  }
}
