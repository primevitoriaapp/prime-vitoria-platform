import { db } from "@/lib/server/db";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { listInvoiceTrips } from "@/lib/finance/client-invoices";
import { tripKm } from "@/lib/finance/client-invoice-calc";

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
  flight: string | null;
  km: number;
  wait_minutes: number;
  amount: number | null;
};

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

  return trips.map((t) => ({
    id: t.id as string,
    number: String(t.id).slice(0, 8).toUpperCase(),
    when: formatBrDateTime(t.scheduled_at as string),
    service: primeServiceTypeLabel(String(t.service_type ?? ""), { audience: "client" }),
    passenger: ((t.passenger_name as string | null)?.trim() || "—") + (t.passenger_count && Number(t.passenger_count) > 1 ? ` (+${Number(t.passenger_count) - 1})` : ""),
    requester: t.created_by ? (profileById.get(t.created_by as string) ?? null) : null,
    cost_center: t.cost_center_id ? (ccById.get(t.cost_center_id as string) ?? null) : null,
    origin: String(t.origin_text ?? "—"),
    destination: String(t.destination_text ?? "—"),
    flight: (t.flight_number as string | null) ?? null,
    km: tripKm(t as never),
    wait_minutes: Number(t.wait_minutes ?? 0) || 0,
    amount: t.client_amount == null ? null : Number(t.client_amount)
  }));
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ponto e vírgula (abre direto no Excel em português). */
export function invoiceReportCsv(rows: InvoiceReportRow[]): string {
  const header = ["Data e hora", "Nº corrida", "Serviço", "Passageiro", "Pedido por", "Centro de custo", "Embarque", "Destino", "Voo", "KM", "Espera (min)", "Valor (R$)"];
  const lines = rows.map((r) =>
    [
      r.when,
      r.number,
      r.service,
      r.passenger,
      r.requester ?? "",
      r.cost_center ?? "",
      r.origin,
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
