import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { shortAddress } from "@/lib/client/short-address";

/**
 * Tela "A faturar": todas as corridas prontas para cobrar (concluídas e aprovadas, ou cancelamento cobrado)
 * que ainda não estão em fatura, de qualquer mês. Com ?q= também mostra as já faturadas que batem na busca.
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    const cols =
      "id, client_id, driver_id, scheduled_at, operational_status, reviewed_at, client_amount, passenger_name, origin_text, destination_text, client_ref, client_ref_base, client_voucher_path, invoice_merge_key, charge_after_cancel, charge_reason, client_invoice_id";

    const [{ data: ready, error }, { data: waiting }] = await Promise.all([
      db
        .from("trips")
        .select(cols)
        .eq("tenant_id", tenantId)
        .is("client_invoice_id", null)
        .not("reviewed_at", "is", null)
        .or("operational_status.eq.completed,charge_after_cancel.eq.true")
        .order("scheduled_at")
        .limit(2000),
      db
        .from("trips")
        .select("client_id")
        .eq("tenant_id", tenantId)
        .is("client_invoice_id", null)
        .is("reviewed_at", null)
        .eq("operational_status", "completed")
        .limit(2000)
    ]);
    if (error) return fail("LIST_FAILED", error.message, 500);

    // Busca também nas já faturadas (para nada parecer "sumido").
    let billed: Record<string, unknown>[] = [];
    if (q.length >= 3) {
      const like = `%${q.replace(/[%_,()]/g, "")}%`;
      const { data } = await db
        .from("trips")
        .select(cols)
        .eq("tenant_id", tenantId)
        .not("client_invoice_id", "is", null)
        .or(`client_ref.ilike.${like},passenger_name.ilike.${like}`)
        .gte("scheduled_at", new Date(Date.now() - 180 * 86400000).toISOString())
        .order("scheduled_at", { ascending: false })
        .limit(40);
      billed = data ?? [];
    }

    const all = [...(ready ?? []), ...billed];
    const cIds = [...new Set([...all.map((t) => t.client_id as string), ...(waiting ?? []).map((w) => w.client_id as string)].filter(Boolean))];
    const dIds = [...new Set(all.map((t) => t.driver_id as string).filter(Boolean))];
    const invIds = [...new Set(billed.map((t) => t.client_invoice_id as string).filter(Boolean))];
    const [{ data: cs }, { data: ds }, { data: invs }] = await Promise.all([
      cIds.length ? db.from("clients").select("id, name, trade_name, payment_term_days, invoice_per_service").in("id", cIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      dIds.length ? db.from("drivers").select("id, full_name").in("id", dIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      invIds.length ? db.from("client_invoices").select("id, number, status").in("id", invIds) : Promise.resolve({ data: [] as Record<string, unknown>[] })
    ]);
    const cBy = new Map((cs ?? []).map((c) => [c.id as string, c]));
    const dBy = new Map((ds ?? []).map((d) => [d.id as string, String(d.full_name ?? "")]));
    const iBy = new Map((invs ?? []).map((i) => [i.id as string, i]));
    const waitBy = new Map<string, number>();
    for (const w of waiting ?? []) waitBy.set(w.client_id as string, (waitBy.get(w.client_id as string) ?? 0) + 1);

    const row = (t: Record<string, unknown>) => {
      const inv = t.client_invoice_id ? iBy.get(t.client_invoice_id as string) : null;
      return {
        id: t.id as string,
        client_id: t.client_id as string,
        scheduled_at: t.scheduled_at as string,
        ref: (t.client_ref as string | null) ?? null,
        ref_base: (t.client_ref_base as string | null) ?? null,
        passenger: (t.passenger_name as string | null) ?? null,
        driver: t.driver_id ? (dBy.get(t.driver_id as string) ?? null) : null,
        route: `${shortAddress(String(t.origin_text ?? ""))} → ${shortAddress(String(t.destination_text ?? ""))}`,
        amount: t.client_amount == null ? null : Number(t.client_amount),
        has_voucher: Boolean(t.client_voucher_path),
        merge_key: (t.invoice_merge_key as string | null) ?? null,
        cancel_charge: t.charge_after_cancel ? String(t.charge_reason ?? "outro") : null,
        invoice: inv ? { id: inv.id as string, number: inv.number as number, status: inv.status as string } : null
      };
    };
    const clients = cIds
      .map((id) => {
        const c = cBy.get(id);
        return {
          id,
          name: String(c?.trade_name || c?.name || "Cliente").trim(),
          payment_term_days: c?.payment_term_days == null ? 30 : Number(c.payment_term_days),
          per_service: c?.invoice_per_service === true,
          waiting: waitBy.get(id) ?? 0
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return ok({ clients, trips: (ready ?? []).map(row), billed: billed.map(row) });
  } catch (e) {
    return mapApiError(e);
  }
}
