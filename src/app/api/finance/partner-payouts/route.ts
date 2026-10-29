import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { groupPayouts, type PayoutOwner, type PayoutRow } from "@/lib/finance/partner-payouts";
import { shortAddress } from "@/lib/client/short-address";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Repasses agrupados por parceiro. ?visao=abertos (padrão) ou ?visao=pagos&from=&to= */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.read");
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const view = url.searchParams.get("visao") === "pagos" ? "pagos" : "abertos";
    let q = db.from("driver_payables").select("id, trip_id, driver_id, amount, due_date, status, paid_at").eq("tenant_id", tenantId).limit(3000);
    if (view === "abertos") q = q.eq("status", "open");
    else {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      q = q.eq("status", "paid");
      if (from && YMD.test(from)) q = q.gte("paid_at", new Date(`${from}T00:00:00-03:00`).toISOString());
      if (to && YMD.test(to)) q = q.lte("paid_at", new Date(`${to}T23:59:59-03:00`).toISOString());
    }
    const { data: pays, error } = await q;
    if (error) return fail("LIST_FAILED", error.message, 500);
    const list = pays ?? [];

    const tripIds = [...new Set(list.map((p) => p.trip_id as string).filter(Boolean))];
    const driverIds = [...new Set(list.map((p) => p.driver_id as string).filter(Boolean))];
    const trips: Record<string, unknown>[] = [];
    const recs: Record<string, unknown>[] = [];
    for (let i = 0; i < tripIds.length; i += 200) {
      const chunk = tripIds.slice(i, i + 200);
      const [t, r] = await Promise.all([
        db.from("trips").select("id, scheduled_at, origin_text, destination_text, client_id, client_invoice_id").in("id", chunk),
        db.from("accounts_receivable").select("trip_id, status").in("trip_id", chunk)
      ]);
      trips.push(...(t.data ?? []));
      recs.push(...(r.data ?? []));
    }
    const tripById = new Map(trips.map((t) => [t.id as string, t]));
    const recPaid = new Set(recs.filter((r) => r.status === "paid").map((r) => r.trip_id as string));
    const invoiceIds = [...new Set(trips.map((t) => t.client_invoice_id as string).filter(Boolean))];
    const clientIds = [...new Set(trips.map((t) => t.client_id as string).filter(Boolean))];

    const [{ data: invs }, { data: clients }, { data: drv }] = await Promise.all([
      invoiceIds.length ? db.from("client_invoices").select("id, status").in("id", invoiceIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      clientIds.length ? db.from("clients").select("id, name, trade_name").in("id", clientIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      driverIds.length
        ? db.from("drivers").select("id, full_name, cpf, pix_key, phone, whatsapp, partner_id").in("id", driverIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] })
    ]);
    const invPaid = new Set((invs ?? []).filter((i) => i.status === "paga").map((i) => i.id as string));
    const clientName = new Map((clients ?? []).map((c) => [c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "Cliente"]));
    const driverRows = drv ?? [];
    const partnerIds = [...new Set(driverRows.map((d) => d.partner_id as string).filter(Boolean))];
    const { data: parts } = partnerIds.length
      ? await db.from("partners").select("id, type, name, trade_name, document, pix_key, whatsapp, phone").in("id", partnerIds)
      : { data: [] as Record<string, unknown>[] };

    const partners = new Map<string, PayoutOwner>(
      (parts ?? []).map((p) => [
        p.id as string,
        {
          id: p.id as string,
          kind: p.type === "PF" ? "PF" : "PJ",
          name: ((p.trade_name as string) || (p.name as string)) ?? "Parceiro",
          document: (p.document as string) ?? null,
          pix_key: (p.pix_key as string) ?? null,
          phone: ((p.whatsapp as string) || (p.phone as string)) ?? null
        }
      ])
    );
    const drivers = new Map<string, PayoutOwner>(
      driverRows.map((d) => [
        d.id as string,
        {
          id: d.id as string,
          kind: "avulso",
          name: (d.full_name as string) || `CPF ${d.cpf}`,
          document: (d.cpf as string) ?? null,
          pix_key: (d.pix_key as string) ?? null,
          phone: ((d.whatsapp as string) || (d.phone as string)) ?? null
        }
      ])
    );
    const partnerOf = new Map(driverRows.map((d) => [d.id as string, (d.partner_id as string) ?? null]));

    const rows: PayoutRow[] = list.map((p) => {
      const t = tripById.get(p.trip_id as string);
      const released = recPaid.has(p.trip_id as string) || (t?.client_invoice_id ? invPaid.has(t.client_invoice_id as string) : false);
      return {
        id: p.id as string,
        amount: Number(p.amount) || 0,
        status: p.status as string,
        paid_at: (p.paid_at as string) ?? null,
        due_date: (p.due_date as string) ?? null,
        released,
        trip_id: p.trip_id as string,
        trip_at: (t?.scheduled_at as string) ?? null,
        route: t ? `${shortAddress(String(t.origin_text ?? ""))} → ${shortAddress(String(t.destination_text ?? ""))}` : "—",
        client_name: clientName.get(t?.client_id as string) ?? "Cliente",
        driver_id: p.driver_id as string,
        driver_name: drivers.get(p.driver_id as string)?.name ?? "Motorista",
        partner_id: partnerOf.get(p.driver_id as string) ?? null
      };
    });

    return ok({ view, groups: groupPayouts(rows, partners, drivers) });
  } catch (error) {
    return mapApiError(error);
  }
}
