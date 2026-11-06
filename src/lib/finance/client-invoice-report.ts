import { db } from "@/lib/server/db";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { listInvoiceTrips } from "@/lib/finance/client-invoices";
import { tripKm } from "@/lib/finance/client-invoice-calc";
import { clientRefFromNotes } from "@/lib/trips/client-ref";
import { groupSplitItems, isSplitGroup, sumMoney } from "@/lib/finance/merge-split-services";

/** Hora parada que o cálculo somou no valor da corrida (metadata.wait). */
export function waitChargeOf(meta: unknown, tripWaitMinutes: number): { minutes: number; billable_minutes: number; amount: number } | null {
  const w = (meta as { wait?: { wait_minutes?: number; billable_minutes?: number; client_amount?: number } } | null)?.wait;
  const amount = Number(w?.client_amount ?? 0);
  // Só vale se bate com a espera gravada na corrida (cálculo antigo/zerado depois não aparece).
  if (!w || !(amount > 0) || !(tripWaitMinutes > 0) || Number(w.wait_minutes ?? 0) !== tripWaitMinutes) return null;
  return { minutes: Number(w.wait_minutes ?? 0), billable_minutes: Number(w.billable_minutes ?? 0), amount: Math.round(amount * 100) / 100 };
}

export type InvoiceReportStop = { address: string; passenger: string | null };

function readStops(raw: unknown): InvoiceReportStop[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => s as { address_text?: string | null; passenger_name?: string | null })
    .filter((s) => String(s.address_text ?? "").trim().length > 0)
    .map((s) => ({ address: String(s.address_text).trim(), passenger: String(s.passenger_name ?? "").trim() || null }));
}

export type InvoiceReportRow = {
  id: string;
  number: string;
  when: string;
  service: string;
  passenger: string;
  requester: string | null;
  cost_center: string | null;
  origin: string;
  destination: string;
  /** Paradas no caminho, na ordem (entre o embarque e o destino). */
  stops: InvoiceReportStop[];
  /** NR / referência do cliente, quando houver. */
  ref: string | null;
  flight: string | null;
  km: number;
  wait_minutes: number;
  /** Hora parada cobrada nesta corrida (já somada em `amount`). */
  wait_charge: { minutes: number; billable_minutes: number; amount: number } | null;
  amount: number | null;
  /** Item que junta trechos divididos (ex.: NR-E1 + NR-E2): ids de todas as corridas. */
  trip_ids?: string[];
  /** Chave para juntar na fatura (escolhida no fechamento). */
  merge_key?: string | null;
};

/** Junta os trechos de um serviço dividido (NR-E1, NR-E2…) num item só, como o cliente pediu. */
export function mergeSplitReportRows(rows: InvoiceReportRow[]): InvoiceReportRow[] {
  return groupSplitItems(rows, (r) => r.ref, (r) => r.merge_key).map((x) => {
    if (!isSplitGroup(x)) return x;
    const [first, ...rest] = x.parts;
    const last = x.parts[x.parts.length - 1];
    const stops: InvoiceReportStop[] = [];
    x.parts.forEach((p, i) => {
      stops.push(...p.stops);
      if (i < x.parts.length - 1) stops.push({ address: p.destination, passenger: `fim do trecho ${i + 1} (${p.when})` });
      if (i > 0 && x.parts[i - 1].destination !== p.origin) stops.push({ address: p.origin, passenger: `início do trecho ${i + 1} (${p.when})` });
    });
    const waitAmt = x.parts.reduce((s, p) => s + (p.wait_charge?.amount ?? 0), 0);
    return {
      ...first,
      ref: x.base,
      service: `${first.service} · ${x.parts.length} trechos (${x.parts.map((p) => p.when).join(" e ")})`,
      passenger: [...new Set(x.parts.map((p) => p.passenger))].join(", "),
      destination: last.destination,
      stops,
      km: Math.round(x.parts.reduce((s, p) => s + (Number(p.km) || 0), 0) * 10) / 10,
      wait_minutes: x.parts.reduce((s, p) => s + p.wait_minutes, 0),
      wait_charge:
        waitAmt > 0
          ? {
              minutes: x.parts.reduce((s, p) => s + (p.wait_charge?.minutes ?? 0), 0),
              billable_minutes: x.parts.reduce((s, p) => s + (p.wait_charge?.billable_minutes ?? 0), 0),
              amount: Math.round(waitAmt * 100) / 100
            }
          : null,
      amount: sumMoney(x.parts.map((p) => p.amount)),
      flight: first.flight ?? rest.find((p) => p.flight)?.flight ?? null,
      trip_ids: x.parts.flatMap((p) => p.trip_ids ?? [p.id])
    };
  });
}

/** Linhas do relatório da fatura: quem usou, quem pediu, de onde, para onde, KM e valor. */
export async function buildInvoiceReport(invoiceId: string): Promise<InvoiceReportRow[]> {
  const trips = await listInvoiceTrips(invoiceId);
  const profileIds = [...new Set(trips.map((t) => t.created_by as string | null).filter(Boolean))] as string[];
  const ccIds = [...new Set(trips.map((t) => t.cost_center_id as string | null).filter(Boolean))] as string[];
  const [{ data: profiles }, { data: centers }] = await Promise.all([
    profileIds.length ? db.from("profiles").select("id, name, role").in("id", profileIds) : Promise.resolve({ data: [] }),
    ccIds.length ? db.from("cost_centers").select("id, code, name").in("id", ccIds) : Promise.resolve({ data: [] })
  ]);
  const profileById = new Map(
    ((profiles ?? []) as { id: string; name: string | null; role: string }[]).map((p) => [
      p.id,
      p.role === "cliente" ? (p.name ?? null) : "Central Prime"
    ])
  );
  const ccById = new Map(
    ((centers ?? []) as { id: string; code: string | null; name: string }[]).map((c) => [c.id, c.code ? `${c.code} · ${c.name}` : c.name])
  );

  const rows: InvoiceReportRow[] = trips.map((t) => ({
    id: t.id as string,
    number: String(t.id).slice(0, 8).toUpperCase(),
    when: formatBrDateTime(t.scheduled_at as string),
    service: primeServiceTypeLabel(String(t.service_type ?? ""), { audience: "client" }),
    passenger: ((t.passenger_name as string | null)?.trim() || "—") + (t.passenger_count && Number(t.passenger_count) > 1 ? ` (+${Number(t.passenger_count) - 1})` : ""),
    requester: t.created_by ? (profileById.get(t.created_by as string) ?? null) : null,
    cost_center: t.cost_center_id ? (ccById.get(t.cost_center_id as string) ?? null) : null,
    origin: String(t.origin_text ?? "—"),
    destination: String(t.destination_text ?? "—"),
    stops: readStops((t as { trip_dropoff_stops?: unknown }).trip_dropoff_stops),
    ref: clientRefFromNotes((t as { notes?: string | null }).notes ?? null),
    flight: (t.flight_number as string | null) ?? null,
    km: tripKm(t as never),
    wait_minutes: Number(t.wait_minutes ?? 0) || 0,
    wait_charge: waitChargeOf((t as { calculation_metadata?: unknown }).calculation_metadata, Number(t.wait_minutes ?? 0) || 0),
    amount: t.client_amount == null ? null : Number(t.client_amount),
    merge_key: ((t as { invoice_merge_key?: string | null }).invoice_merge_key ?? null) || null
  }));
  return mergeSplitReportRows(rows);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ponto e vírgula (abre direto no Excel em português). */
export function invoiceReportCsv(rows: InvoiceReportRow[]): string {
  const header = ["Data e hora", "Nº corrida", "Serviço", "Passageiro", "Pedido por", "Centro de custo", "Embarque", "Paradas", "Destino", "Voo", "KM", "Espera (min)", "Valor (R$)"];
  const lines = rows.map((r) =>
    [
      r.when,
      r.ref ?? r.number,
      r.service,
      r.passenger,
      r.requester ?? "",
      r.cost_center ?? "",
      r.origin,
      r.stops.map((x, i) => `${i + 1}) ${x.address}${x.passenger ? ` (${x.passenger})` : ""}`).join(" | "),
      r.destination,
      r.flight ?? "",
      r.km.toLocaleString("pt-BR"),
      r.wait_minutes,
      r.amount == null ? "" : r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ]
      .map(csvCell)
      .join(";")
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
