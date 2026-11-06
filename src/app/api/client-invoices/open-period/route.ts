import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { clientRefFromNotes } from "@/lib/trips/client-ref";
import { shortAddress } from "@/lib/client/short-address";

const DONE = ["completed"];
const DEAD = ["cancelled", "rejected", "no_show"];

/**
 * Conta corrente do mês (?month=2026-11): corridas de cada cliente que ainda não entraram em fatura,
 * com o que já está aprovado, o que falta aprovar e o que ainda vai acontecer.
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("VALIDATION_ERROR", "Mês inválido", 400);
    const [y, m] = month.split("-").map(Number);
    const from = new Date(`${month}-01T00:00:00-03:00`).toISOString();
    const to = new Date(`${new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)}T23:59:59-03:00`).toISOString();
    const { data: trips, error } = await db
      .from("trips")
      .select("id, client_id, driver_id, scheduled_at, operational_status, reviewed_at, client_amount, driver_amount, km_billable, actual_km, passenger_name, origin_text, destination_text, notes")
      .eq("tenant_id", tenantId)
      .is("client_invoice_id", null)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .order("scheduled_at")
      .limit(3000);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const live = (trips ?? []).filter((t) => !DEAD.includes(t.operational_status as string));
    const cIds = [...new Set(live.map((t) => t.client_id as string))];
    const dIds = [...new Set(live.map((t) => t.driver_id as string).filter(Boolean))];
    const [{ data: cs }, { data: ds }] = await Promise.all([
      cIds.length ? db.from("clients").select("id, name, trade_name, invoiced, invoice_per_service, invoice_closing_day, payment_term_days").in("id", cIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      dIds.length ? db.from("drivers").select("id, full_name").in("id", dIds) : Promise.resolve({ data: [] as Record<string, unknown>[] })
    ]);
    const cBy = new Map((cs ?? []).map((c) => [c.id as string, c]));
    const dName = new Map((ds ?? []).map((d) => [d.id as string, String(d.full_name ?? "Motorista")]));
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const groups = new Map<string, Record<string, unknown> & { trips: Record<string, unknown>[] }>();
    for (const t of live) {
      const c = cBy.get(t.client_id as string);
      const g =
        groups.get(t.client_id as string) ??
        ({
          client_id: t.client_id,
          client_name: String(c?.trade_name || c?.name || "Cliente"),
          billing: c?.invoice_per_service ? "por serviço" : c?.invoiced === false ? "à vista" : `mensal (fecha dia ${c?.invoice_closing_day ?? "último"}, paga em ${c?.payment_term_days ?? 30} dias)`,
          approved_total: 0,
          approved_count: 0,
          to_approve_total: 0,
          to_approve_count: 0,
          upcoming_count: 0,
          upcoming_total: 0,
          driver_total: 0,
          trips: []
        } as Record<string, unknown> & { trips: Record<string, unknown>[] });
      const amt = Number(t.client_amount ?? 0);
      const done = DONE.includes(t.operational_status as string);
      const stage = done ? (t.reviewed_at ? "aprovada" : "aprovar") : "agendada";
      if (stage === "aprovada") {
        g.approved_total = r2(Number(g.approved_total) + amt);
        g.approved_count = Number(g.approved_count) + 1;
      } else if (stage === "aprovar") {
        g.to_approve_total = r2(Number(g.to_approve_total) + amt);
        g.to_approve_count = Number(g.to_approve_count) + 1;
      } else {
        g.upcoming_total = r2(Number(g.upcoming_total) + amt);
        g.upcoming_count = Number(g.upcoming_count) + 1;
      }
      if (done) g.driver_total = r2(Number(g.driver_total) + Number(t.driver_amount ?? 0));
      g.trips.push({
        id: t.id,
        scheduled_at: t.scheduled_at,
        stage,
        ref: clientRefFromNotes(t.notes as string | null),
        driver: t.driver_id ? dName.get(t.driver_id as string) ?? null : null,
        passenger: t.passenger_name ?? null,
        route: `${shortAddress(String(t.origin_text ?? ""))} → ${shortAddress(String(t.destination_text ?? ""))}`,
        km: t.km_billable != null ? Number(t.km_billable) : t.actual_km != null ? Number(t.actual_km) : null,
        client_amount: t.client_amount == null ? null : Number(t.client_amount),
        driver_amount: t.driver_amount == null ? null : Number(t.driver_amount)
      });
      groups.set(t.client_id as string, g);
    }
    const out = [...groups.values()].sort((a, b) => Number(b.approved_total) + Number(b.to_approve_total) - (Number(a.approved_total) + Number(a.to_approve_total)));
    return ok({ month, clients: out });
  } catch (e) {
    return mapApiError(e);
  }
}
