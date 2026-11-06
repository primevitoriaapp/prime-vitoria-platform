import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { resyncOpenDriverPayoutDates } from "@/lib/finance/driver-payout-sync";

/** Motorista à vista: GET / PATCH {paid_upfront}. Recalcula a data dos repasses em aberto dele. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data } = await db.from("drivers").select("paid_upfront").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    return ok({ paid_upfront: Boolean(data?.paid_upfront) });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = z.object({ paid_upfront: z.boolean() }).parse(await request.json().catch(() => ({})));
    const { data, error } = await db.from("drivers").update({ paid_upfront: body.paid_upfront }).eq("id", id).eq("tenant_id", tenantId).select("id, full_name").maybeSingle();
    if (error || !data) return fail("NOT_FOUND", "Motorista não encontrado", 404);
    const { data: open } = await db.from("driver_payables").select("trip_id").eq("tenant_id", tenantId).eq("driver_id", id).eq("status", "open").limit(500);
    const changed = (open ?? []).length ? await resyncOpenDriverPayoutDates(tenantId, { tripIds: (open ?? []).map((o) => o.trip_id as string) }) : 0;
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "driver.payout_terms", entityType: "driver", entityId: id, metadata: { a_vista: body.paid_upfront } }).catch(() => undefined);
    return ok({ paid_upfront: body.paid_upfront, repasses_atualizados: changed });
  } catch (e) {
    return mapApiError(e);
  }
}
