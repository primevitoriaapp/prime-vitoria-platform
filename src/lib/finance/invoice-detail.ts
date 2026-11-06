import { db } from "@/lib/server/db";
import { getClientInvoice, type ClientInvoiceRow } from "@/lib/finance/client-invoices";
import { clientRefFromNotes } from "@/lib/trips/client-ref";
import { prepaidByTrip } from "@/lib/finance/booking-payments";
import { groupSplitItems, isSplitGroup, sumMoney } from "@/lib/finance/merge-split-services";

export type InvoiceService = {
  id: string;
  /** Item que junta trechos divididos (NR-E1 + NR-E2): todas as corridas. */
  trip_ids?: string[];
  merge_key?: string | null;
  ref: string | null;
  when: string;
  route: string;
  passenger: string;
  amount: number | null;
  status: string;
  km: number | null;
};
export type InvoiceEvent = { at: string; label: string; detail?: string | null; done: boolean };
export type InvoicePayout = { driver: string; amount: number; due_date: string | null; status: string };

export type InvoiceDetail = {
  invoice: ClientInvoiceRow;
  client_name: string;
  services: InvoiceService[];
  history: InvoiceEvent[];
  /** Já pago antecipado (sinal na reserva) pelas corridas desta fatura. */
  prepaid: number;
  /** Só para a equipe Prime. */
  internal?: { payouts: InvoicePayout[]; payout_total: number; margin: number; margin_pct: number | null };
};

const TZ = "America/Sao_Paulo";
const shortPlace = (t: string | null) =>
  String(t ?? "—")
    .split(" - ")[0]
    .split(",")[0]
    .trim()
    .slice(0, 48);
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");

const ACTION_LABEL: Record<string, string> = {
  "invoice.per_service": "Fatura criada (fechamento do voucher)",
  "invoice.boleto_upload": "Boleto anexado",
  "invoice.nf_upload": "Nota fiscal anexada",
  "invoice.voucher_upload": "Voucher anexado",
  "invoice.send": "E-mail enviado ao cliente",
  "invoice.reminder": "Lembrete enviado ao cliente",
  "invoice.status_enviada": "Marcada como enviada ao cliente",
  "invoice.status_paga": "Pagamento confirmado",
  "invoice.status_cancelada": "Fatura cancelada",
  "invoice.due_change": "Vencimento alterado"
};

export async function loadInvoiceDetail(tenantId: string, id: string, opts: { internal: boolean }): Promise<InvoiceDetail | null> {
  const invoice = await getClientInvoice(tenantId, id);
  if (!invoice) return null;
  const [{ data: client }, { data: trips }, { data: audits }] = await Promise.all([
    db.from("clients").select("name, trade_name").eq("id", invoice.client_id).maybeSingle(),
    db
      .from("trips")
      .select("id, scheduled_at, origin_text, destination_text, passenger_name, passenger_count, client_amount, operational_status, notes, km_billable, actual_km, trip_dropoff_stops, invoice_merge_key")
      .eq("client_invoice_id", id)
      .order("scheduled_at"),
    db
      .from("audit_events")
      .select("action, metadata, created_at")
      .eq("tenant_id", tenantId)
      .eq("entity_type", "client_invoice")
      .eq("entity_id", id)
      .order("created_at")
      .limit(60)
  ]);

  const rawServices: InvoiceService[] = (trips ?? []).map((t) => ({
    id: t.id as string,
    ref: clientRefFromNotes(t.notes as string | null),
    when: new Date(t.scheduled_at as string).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    route: [
      shortPlace(t.origin_text as string | null),
      ...(Array.isArray(t.trip_dropoff_stops) ? (t.trip_dropoff_stops as { address_text?: string | null }[]) : [])
        .filter((x) => String(x.address_text ?? "").trim())
        .map((x) => shortPlace(x.address_text ?? null)),
      shortPlace(t.destination_text as string | null)
    ].join(" → "),
    passenger:
      ((t.passenger_name as string | null)?.trim() || "—") + (t.passenger_count && Number(t.passenger_count) > 1 && !String(t.passenger_name ?? "").includes(",") ? ` (+${Number(t.passenger_count) - 1})` : ""),
    amount: t.client_amount == null ? null : Number(t.client_amount),
    status: t.operational_status as string,
    km: t.km_billable != null ? Number(t.km_billable) : t.actual_km != null ? Number(t.actual_km) : null,
    merge_key: ((t as { invoice_merge_key?: string | null }).invoice_merge_key ?? null) || null
  }));

  // Serviço dividido em trechos (NR-E1, NR-E2) aparece como um item só (NR-E), como o cliente pediu.
  const services: InvoiceService[] = groupSplitItems(rawServices, (x) => x.ref, (x) => x.merge_key).map((x) => {
    if (!isSplitGroup(x)) return x;
    const [first] = x.parts;
    const pts: string[] = [];
    for (const p of x.parts) for (const pt of p.route.split(" → ")) if (pts[pts.length - 1] !== pt) pts.push(pt);
    const route = pts.join(" → ");
    return {
      ...first,
      ref: x.base,
      when: `${x.parts.map((p) => p.when).join(" e ")} · ${x.parts.length} trechos`,
      route,
      passenger: [...new Set(x.parts.map((p) => p.passenger))].join(", "),
      amount: sumMoney(x.parts.map((p) => p.amount)),
      status: x.parts.every((p) => p.status === "completed") ? "completed" : x.parts.find((p) => p.status !== "completed")?.status ?? first.status,
      km: x.parts.some((p) => p.km != null) ? Math.round(x.parts.reduce((s2, p) => s2 + (p.km ?? 0), 0) * 10) / 10 : null,
      trip_ids: x.parts.map((p) => p.id)
    };
  });

  // Histórico: o que de fato aconteceu (registro de auditoria + datas da fatura).
  const history: InvoiceEvent[] = [];
  const seen = new Set<string>();
  const audited = (audits ?? []) as { action: string; metadata: Record<string, unknown> | null; created_at: string }[];
  if (!audited.some((a) => a.action === "invoice.per_service")) history.push({ at: invoice.created_at, label: "Fatura criada", done: true });
  for (const a of audited) {
    const label = ACTION_LABEL[a.action];
    if (!label) continue;
    // Para o cliente: sem detalhes internos de arquivos repetidos.
    const key = `${a.action}|${a.created_at.slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let detail: string | null = null;
    const m = a.metadata ?? {};
    if (a.action === "invoice.due_change" && m.para) detail = `${m.de ? `de ${brDate(String(m.de))} ` : ""}para ${brDate(String(m.para))}`;
    if ((a.action === "invoice.send" || a.action === "invoice.reminder") && Array.isArray(m.to)) detail = (m.to as string[]).join(", ");
    if (a.action === "invoice.status_paga" && m.pago_em) detail = `Pago em ${brDate(String(m.pago_em))}`;
    if (!opts.internal && (a.action === "invoice.boleto_upload" || a.action === "invoice.nf_upload" || a.action === "invoice.voucher_upload")) detail = null;
    history.push({ at: a.created_at, label, detail, done: true });
  }
  const inv = invoice as ClientInvoiceRow & { viewed_at?: string | null };
  if (inv.viewed_at) history.push({ at: inv.viewed_at, label: "Fatura visualizada pelo cliente no portal", done: true });
  if (inv.paid_at && !audited.some((a) => a.action === "invoice.status_paga")) history.push({ at: inv.paid_at, label: "Pagamento confirmado", done: true });
  history.sort((a, b) => a.at.localeCompare(b.at));
  if (invoice.status !== "paga" && invoice.status !== "cancelada") {
    history.push({ at: `${invoice.due_date}T12:00:00-03:00`, label: "Aguardando vencimento", detail: `Vence em ${brDate(invoice.due_date)}`, done: false });
  }

  const pre = await prepaidByTrip(tenantId, rawServices.map((x) => x.id)).catch(() => new Map<string, number>());
  const prepaid = Math.round(rawServices.reduce((acc, x) => acc + (pre.get(x.id) ?? 0), 0) * 100) / 100;

  const out: InvoiceDetail = {
    prepaid,
    invoice,
    client_name: ((client?.trade_name as string | null) || (client?.name as string | null) || "Cliente").trim(),
    services,
    history
  };

  if (opts.internal) {
    const tripIds = rawServices.map((s) => s.id);
    const { data: pays } = tripIds.length
      ? await db.from("driver_payables").select("driver_id, amount, due_date, status").in("trip_id", tripIds)
      : { data: [] as { driver_id: string; amount: number; due_date: string | null; status: string }[] };
    const dIds = [...new Set((pays ?? []).map((p) => p.driver_id as string).filter(Boolean))];
    const { data: ds } = dIds.length ? await db.from("drivers").select("id, full_name").in("id", dIds) : { data: [] as { id: string; full_name: string | null }[] };
    const names = new Map((ds ?? []).map((d) => [d.id as string, (d.full_name as string | null) ?? "Motorista"]));
    const payouts: InvoicePayout[] = [];
    for (const p of pays ?? []) {
      const driver = names.get(p.driver_id as string) ?? "Motorista";
      const same = payouts.find((x) => x.driver === driver && x.due_date === p.due_date && x.status === p.status);
      if (same) same.amount = Math.round((same.amount + Number(p.amount)) * 100) / 100;
      else payouts.push({ driver, amount: Number(p.amount), due_date: (p.due_date as string | null) ?? null, status: p.status as string });
    }
    const payout_total = Math.round(payouts.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const total = Number(invoice.total_amount) || 0;
    const margin = Math.round((total - payout_total) * 100) / 100;
    out.internal = { payouts, payout_total, margin, margin_pct: total > 0 ? Math.round((margin / total) * 1000) / 10 : null };
  }
  return out;
}
