import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { refKey } from "@/lib/trips/trip-extras";

/**
 * NRs / referências deste cliente nos últimos 90 dias, para escolher numa corrida nova
 * ("incluir nesta NR"). Mostra quantas corridas ainda estão a faturar e se já houve fatura.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: trips, error } = await db
      .from("trips")
      .select("id, client_ref, client_ref_base, scheduled_at, passenger_name, client_invoice_id, operational_status")
      .eq("tenant_id", tenantId)
      .eq("client_id", id)
      .not("client_ref_base", "is", null)
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    const invIds = [...new Set((trips ?? []).map((t) => t.client_invoice_id as string | null).filter(Boolean))] as string[];
    const { data: invs } = invIds.length ? await db.from("client_invoices").select("id, number").in("id", invIds) : { data: [] as { id: string; number: number }[] };
    const numOf = new Map((invs ?? []).map((i) => [i.id as string, i.number as number]));

    type G = { ref: string; open: number; invoiced: number; last: string; first: string; passengers: Set<string>; invoices: Set<number> };
    const groups = new Map<string, G>();
    for (const t of trips ?? []) {
      if (t.operational_status === "cancelled") continue;
      const base = String(t.client_ref_base);
      const key = refKey(base);
      const g = groups.get(key) ?? { ref: base, open: 0, invoiced: 0, last: String(t.scheduled_at), first: String(t.scheduled_at), passengers: new Set<string>(), invoices: new Set<number>() };
      // Prefere a grafia com "NR" (é como o cliente reconhece).
      if (!g.ref.startsWith("NR") && base.startsWith("NR")) g.ref = base;
      if (t.client_invoice_id) {
        g.invoiced += 1;
        const n = numOf.get(t.client_invoice_id as string);
        if (n) g.invoices.add(n);
      } else g.open += 1;
      if (String(t.scheduled_at) < g.first) g.first = String(t.scheduled_at);
      const p = String(t.passenger_name ?? "").trim().split(/\s+/)[0];
      if (p) g.passengers.add(p);
      groups.set(key, g);
    }
    const refs = [...groups.values()]
      .map((g) => ({ ref: g.ref, open: g.open, invoiced: g.invoiced, first: g.first, last: g.last, passengers: [...g.passengers].slice(0, 4), invoices: [...g.invoices] }))
      .sort((a, b) => (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) || b.last.localeCompare(a.last));
    return ok({ refs });
  } catch (e) {
    return mapApiError(e);
  }
}
