import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { clientRefFromNotes } from "@/lib/trips/client-ref";
import { groupVouchers, type VoucherTrip } from "@/lib/finance/voucher-groups";

/** Vouchers (NR) ainda sem fatura, dos clientes que fecham por serviço (ex.: CEP). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { data: clients } = await db
      .from("clients")
      .select("id, name, trade_name")
      .eq("tenant_id", tenantId)
      .eq("invoice_per_service", true);
    const ids = (clients ?? []).map((c) => c.id as string);
    if (!ids.length) return ok({ groups: [] });
    const nameBy = new Map((clients ?? []).map((c) => [c.id as string, ((c.trade_name as string | null) || (c.name as string)).trim()]));
    const { data: trips, error } = await db
      .from("trips")
      .select("id, client_id, scheduled_at, operational_status, client_amount, notes, client_voucher_path")
      .eq("tenant_id", tenantId)
      .in("client_id", ids)
      .is("client_invoice_id", null)
      .not("operational_status", "in", "(cancelled,rejected,no_show)")
      .order("scheduled_at")
      .limit(1000);
    if (error) return fail("TRIPS_FAILED", error.message, 500);
    const list: VoucherTrip[] = [];
    for (const t of trips ?? []) {
      const ref = clientRefFromNotes(t.notes as string | null);
      if (!ref) continue;
      list.push({
        id: t.id as string,
        client_id: t.client_id as string,
        client_name: nameBy.get(t.client_id as string) ?? "Cliente",
        ref,
        scheduled_at: t.scheduled_at as string,
        operational_status: t.operational_status as string,
        client_amount: t.client_amount == null ? null : Number(t.client_amount),
        has_voucher: Boolean(t.client_voucher_path)
      });
    }
    return ok({ groups: groupVouchers(list) });
  } catch (error) {
    return mapApiError(error);
  }
}
