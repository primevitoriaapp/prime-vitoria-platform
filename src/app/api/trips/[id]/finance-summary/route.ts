import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { can } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";

/** Resumo financeiro/ERP da corrida. Valores monetários só com `finance.read`. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const { data: trip, error: tripErr } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id, financial_status, operational_status")
      .eq("id", tripId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (tripErr || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    const showAmounts = can(session, "finance.read");

    const [{ data: financial }, { data: receivable }] = await Promise.all([
      showAmounts ? db.from("trip_financials").select("*").eq("trip_id", tripId).maybeSingle() : Promise.resolve({ data: null }),
      db.from("accounts_receivable").select("id, amount, due_date, status").eq("trip_id", tripId).maybeSingle()
    ]);

    let erpMappings: { provider: string; external_id: string; sync_status: string }[] = [];
    if (receivable?.id) {
      const { data: maps } = await db
        .from("erp_entity_mappings")
        .select("provider, external_id, sync_status")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "receivable")
        .eq("internal_id", receivable.id);
      erpMappings = (maps ?? []) as typeof erpMappings;
    }

    return ok({
      trip_id: tripId,
      financial_status: trip.financial_status,
      operational_status: trip.operational_status,
      has_receivable: Boolean(receivable?.id),
      receivable: showAmounts
        ? receivable
        : receivable
          ? { id: receivable.id, status: receivable.status, due_date: receivable.due_date }
          : null,
      financial: showAmounts ? financial ?? null : null,
      erp_mappings: erpMappings,
      can_enqueue_erp: can(session, "erp.jobs.enqueue")
    });
  } catch (error) {
    return mapApiError(error);
  }
}
