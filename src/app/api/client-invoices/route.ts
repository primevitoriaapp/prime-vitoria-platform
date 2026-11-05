import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { listClientInvoices } from "@/lib/finance/client-invoices";
import { isFinanceStaff } from "@/lib/finance/client-invoice-access";
import { db } from "@/lib/server/db";

/** Lista de faturas: equipe Prime (todas ou de um cliente) ou gestor (só da própria empresa). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const clientParam = z.string().uuid().optional().parse(url.searchParams.get("client_id") ?? undefined);

    if (isFinanceStaff(session)) {
      const rows = await listClientInvoices(tenantId, { clientId: clientParam, includeCancelled: true });
      const ids = [...new Set(rows.map((r) => r.client_id))];
      const { data: clients } = ids.length
        ? await db.from("clients").select("id, name, trade_name").in("id", ids)
        : { data: [] as { id: string; name: string; trade_name: string | null }[] };
      const names = new Map((clients ?? []).map((c) => [c.id, (c.trade_name as string | null) || (c.name as string)]));
      // Quanto cada motorista recebe por fatura e quando (o que ele vê na carteira).
      const invIds = rows.map((r) => r.id);
      const payouts = new Map<string, { driver: string; amount: number; due_date: string | null; status: string }[]>();
      if (invIds.length) {
        const { data: trips } = await db.from("trips").select("id, client_invoice_id").in("client_invoice_id", invIds).limit(5000);
        const invOfTrip = new Map((trips ?? []).map((t) => [t.id as string, t.client_invoice_id as string]));
        const tripIds = [...invOfTrip.keys()];
        if (tripIds.length) {
          const { data: pays } = await db.from("driver_payables").select("trip_id, driver_id, amount, due_date, status").in("trip_id", tripIds);
          const dIds = [...new Set((pays ?? []).map((p) => p.driver_id as string).filter(Boolean))];
          const { data: ds } = dIds.length ? await db.from("drivers").select("id, full_name").in("id", dIds) : { data: [] as { id: string; full_name: string | null }[] };
          const dName = new Map((ds ?? []).map((d) => [d.id as string, (d.full_name as string | null) ?? "Motorista"]));
          for (const p of pays ?? []) {
            const inv = invOfTrip.get(p.trip_id as string);
            if (!inv) continue;
            const list = payouts.get(inv) ?? [];
            const name = dName.get(p.driver_id as string) ?? "Motorista";
            const same = list.find((x) => x.driver === name && x.due_date === p.due_date && x.status === p.status);
            if (same) same.amount = Math.round((same.amount + Number(p.amount)) * 100) / 100;
            else list.push({ driver: name, amount: Number(p.amount), due_date: (p.due_date as string | null) ?? null, status: p.status as string });
            payouts.set(inv, list);
          }
        }
      }
      return ok(rows.map((r) => ({ ...r, client_name: names.get(r.client_id) ?? null, payouts: payouts.get(r.id) ?? [] })));
    }

    if (session.role === "cliente" && session.clientId && session.clientAccess !== "solicitante") {
      return ok(await listClientInvoices(tenantId, { clientId: session.clientId }));
    }
    return fail("FORBIDDEN", "Sem acesso às faturas", 403);
  } catch (error) {
    return mapApiError(error);
  }
}
