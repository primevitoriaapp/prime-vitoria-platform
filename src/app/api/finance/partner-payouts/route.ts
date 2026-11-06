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
    let q = db.from("driver_payables").select("id, trip_id, driver_id, amount, due_date, status, paid_at, batch_id, payment_method").eq("tenant_id", tenantId).limit(3000);
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
        db.from("trips").select("id, scheduled_at, origin_text, destination_text, client_id, client_invoice_id, service_mode, actual_km, km_billable, wait_minutes, calculation_metadata").in("id", chunk),
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
      clientIds.length ? db.from("clients").select("id, name, trade_name, driver_paid_upfront").in("id", clientIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      driverIds.length
        ? db.from("drivers").select("id, full_name, cpf, pix_key, phone, whatsapp, partner_id, paid_upfront").in("id", driverIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] })
    ]);
    const invPaid = new Set((invs ?? []).filter((i) => i.status === "paga").map((i) => i.id as string));
    const upfront = new Set((clients ?? []).filter((c) => c.driver_paid_upfront === true).map((c) => c.id as string));
    const clientName = new Map((clients ?? []).map((c) => [c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "Cliente"]));
    const driverRows = drv ?? [];
    const upfrontDriver = new Set(driverRows.filter((d) => d.paid_upfront === true).map((d) => d.id as string));
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

    // Quais repasses pagos já têm comprovante.
    const paidIdsList = list.filter((p) => p.status === "paid").map((p) => p.id as string);
    const withProof = new Map<string, string>();
    for (let i = 0; i < paidIdsList.length; i += 300) {
      const { data: pr } = await db.from("driver_payment_proofs").select("driver_payable_id, storage_url, created_at").in("driver_payable_id", paidIdsList.slice(i, i + 300)).order("created_at");
      for (const r of pr ?? []) withProof.set(r.driver_payable_id as string, r.storage_url as string); // o mais recente vence
    }
    const rows: PayoutRow[] = list.map((p) => {
      const t = tripById.get(p.trip_id as string);
      // Cliente com repasse imediato (a Prime paga o motorista sem esperar o cliente): já liberado.
      const released =
        (t?.client_id ? upfront.has(t.client_id as string) : false) ||
        upfrontDriver.has(p.driver_id as string) ||
        recPaid.has(p.trip_id as string) ||
        (t?.client_invoice_id ? invPaid.has(t.client_invoice_id as string) : false);
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
        km_info: t ? kmInfo(t as Record<string, unknown>, Number(p.amount)) : null,
        client_name: clientName.get(t?.client_id as string) ?? "Cliente",
        driver_id: p.driver_id as string,
        driver_name: drivers.get(p.driver_id as string)?.name ?? "Motorista",
        partner_id: partnerOf.get(p.driver_id as string) ?? null,
        batch_id: (p.batch_id as string | null) ?? null,
        payment_method: (p.payment_method as string | null) ?? null,
        has_proof: withProof.has(p.id as string),
        proof_url: withProof.get(p.id as string) ?? null
      };
    });

    return ok({ view, groups: groupPayouts(rows, partners, drivers) });
  } catch (error) {
    return mapApiError(error);
  }
}

/** "20 km × R$ 2,50 (mínimo; rodou 19,9 km) + espera 15 min R$ 8,75" para o extrato do motorista. */
function kmInfo(t: Record<string, unknown>, amount: number): string | null {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const meta = (t.calculation_metadata ?? null) as { wait?: { driver_amount?: number; billable_minutes?: number; wait_minutes?: number } } | null;
  const waitMin = Number(t.wait_minutes ?? 0) || 0;
  const waitDrv = waitMin > 0 && Number(meta?.wait?.wait_minutes ?? -1) === waitMin ? Number(meta?.wait?.driver_amount ?? 0) : 0;
  const waitTxt = waitDrv > 0 ? ` + espera ${meta?.wait?.billable_minutes ?? waitMin} min ${brl(waitDrv)}` : "";
  if (t.service_mode !== "km") return waitTxt ? waitTxt.slice(3) : null;
  const real = t.actual_km != null ? Number(t.actual_km) : null;
  const base = Math.round((amount - waitDrv) * 100) / 100;
  // KM pago ao motorista: o real, ou o mínimo quando o valor mostra que foi pago pelo mínimo.
  const billed = t.km_billable != null ? Number(t.km_billable) : real;
  if (!billed || !(base > 0)) return real ? `${fmt(real)} km${waitTxt}` : waitTxt || null;
  const rateBilled = base / billed;
  const rateReal = real ? base / real : null;
  const clean = (r: number) => Math.abs(r * 100 - Math.round(r * 100)) < 0.001;
  const usedMin = real != null && billed > real && clean(rateBilled) && !(rateReal != null && clean(rateReal));
  const km = usedMin ? billed : real ?? billed;
  const rate = base / km;
  return `${fmt(km)} km × ${brl(Math.round(rate * 100) / 100)}${usedMin ? ` (mínimo; rodou ${fmt(real!)} km)` : ""}${waitTxt}`;
}
