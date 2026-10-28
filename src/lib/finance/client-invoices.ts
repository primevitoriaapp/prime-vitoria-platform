import { db } from "@/lib/server/db";
import {
  invoiceDueDate,
  periodUtcBounds,
  summarizeInvoice,
  type InvoiceTripInput
} from "@/lib/finance/client-invoice-calc";

export type ClientInvoiceRow = {
  id: string;
  number: number;
  tenant_id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  billing_issuer: string | null;
  trip_count: number;
  total_km: number;
  total_amount: number;
  status: "aberta" | "enviada" | "paga" | "cancelada";
  boleto_url: string | null;
  boleto_line: string | null;
  nf_number: string | null;
  nf_url: string | null;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type GenerateResult = {
  client_id: string;
  client_name: string;
  invoice_id?: string;
  trip_count: number;
  total_amount: number;
  trips_without_amount: number;
  skipped?: string;
};

/**
 * Fecha o período: para cada cliente com corridas concluídas ainda não faturadas,
 * cria a fatura, vincula as corridas e alinha o vencimento das contas a receber.
 */
export async function generateClientInvoices(input: {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  clientId?: string;
  createdBy?: string | null;
}): Promise<GenerateResult[]> {
  const { fromIso, toIso } = periodUtcBounds(input.periodStart, input.periodEnd);
  let q = db
    .from("trips")
    .select("id, client_id, scheduled_at, client_amount, km_billable, actual_km, planned_km")
    .eq("tenant_id", input.tenantId)
    .eq("operational_status", "completed")
    .is("client_invoice_id", null)
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso)
    .limit(5000);
  if (input.clientId) q = q.eq("client_id", input.clientId);
  const { data: trips, error } = await q;
  if (error) throw new Error(error.message);

  const byClient = new Map<string, (InvoiceTripInput & { client_id: string })[]>();
  for (const t of (trips ?? []) as (InvoiceTripInput & { client_id: string })[]) {
    const list = byClient.get(t.client_id) ?? [];
    list.push(t);
    byClient.set(t.client_id, list);
  }
  if (byClient.size === 0) return [];

  const { data: clients } = await db
    .from("clients")
    .select("id, name, trade_name, payment_term_days, billing_issuer, invoiced")
    .in("id", [...byClient.keys()]);
  const clientById = new Map((clients ?? []).map((c) => [c.id as string, c]));

  const results: GenerateResult[] = [];
  for (const [clientId, list] of byClient) {
    const c = clientById.get(clientId);
    const name = ((c?.trade_name as string | null) || (c?.name as string | null) || "Cliente") as string;
    const summary = summarizeInvoice(list);
    if (c && c.invoiced === false) {
      results.push({
        client_id: clientId,
        client_name: name,
        trip_count: summary.trip_count,
        total_amount: summary.total_amount,
        trips_without_amount: summary.trips_without_amount,
        skipped: "Cliente não faturado (paga antes do serviço)"
      });
      continue;
    }
    const due = invoiceDueDate(input.periodEnd, (c?.payment_term_days as number | null) ?? null);

    const { data: inv, error: invErr } = await db
      .from("client_invoices")
      .insert({
        tenant_id: input.tenantId,
        client_id: clientId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        due_date: due,
        billing_issuer: (c?.billing_issuer as string | null) ?? null,
        trip_count: summary.trip_count,
        total_km: summary.total_km,
        total_amount: summary.total_amount,
        created_by: input.createdBy ?? null
      })
      .select("id, number")
      .single();
    if (invErr || !inv) {
      results.push({
        client_id: clientId,
        client_name: name,
        trip_count: summary.trip_count,
        total_amount: summary.total_amount,
        trips_without_amount: summary.trips_without_amount,
        skipped: /uq_client_invoices_period_active/.test(invErr?.message ?? "")
          ? "Já existe fatura deste cliente para o período"
          : (invErr?.message ?? "falha ao criar")
      });
      continue;
    }

    const ids = list.map((t) => t.id);
    await db.from("trips").update({ client_invoice_id: inv.id }).in("id", ids).eq("tenant_id", input.tenantId);
    await db
      .from("accounts_receivable")
      .update({ due_date: due, reference: `Fatura ${String(inv.number).padStart(5, "0")}` })
      .in("trip_id", ids)
      .eq("tenant_id", input.tenantId)
      .neq("status", "paid");

    results.push({
      client_id: clientId,
      client_name: name,
      invoice_id: inv.id as string,
      trip_count: summary.trip_count,
      total_amount: summary.total_amount,
      trips_without_amount: summary.trips_without_amount
    });
  }
  return results;
}

export async function listClientInvoices(tenantId: string, opts: { clientId?: string; includeCancelled?: boolean }) {
  let q = db
    .from("client_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("period_start", { ascending: false })
    .order("number", { ascending: false })
    .limit(60);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (!opts.includeCancelled) q = q.neq("status", "cancelada");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientInvoiceRow[];
}

export async function getClientInvoice(tenantId: string, id: string) {
  const { data } = await db.from("client_invoices").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return (data as ClientInvoiceRow | null) ?? null;
}

export async function listInvoiceTrips(invoiceId: string) {
  const { data, error } = await db
    .from("trips")
    .select(
      "id, scheduled_at, service_type, passenger_name, passenger_count, origin_text, destination_text, flight_number, cost_center_id, client_amount, km_billable, actual_km, planned_km, wait_minutes, created_by"
    )
    .eq("client_invoice_id", invoiceId)
    .order("scheduled_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Atualiza status (enviada / paga / cancelada). Paga baixa as contas a receber; cancelada libera as corridas. */
export async function updateClientInvoiceStatus(
  tenantId: string,
  id: string,
  patch: {
    status?: "aberta" | "enviada" | "paga" | "cancelada";
    boleto_url?: string | null;
    boleto_line?: string | null;
    nf_number?: string | null;
    nf_url?: string | null;
    notes?: string | null;
  }
) {
  const update: Record<string, unknown> = {};
  if (patch.boleto_url !== undefined) update.boleto_url = patch.boleto_url;
  if (patch.boleto_line !== undefined) update.boleto_line = patch.boleto_line;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.nf_number !== undefined) update.nf_number = patch.nf_number;
  if (patch.nf_url !== undefined) update.nf_url = patch.nf_url;
  if (patch.status) {
    update.status = patch.status;
    if (patch.status === "enviada") update.sent_at = new Date().toISOString();
    if (patch.status === "paga") update.paid_at = new Date().toISOString();
  }
  const { data, error } = await db
    .from("client_invoices")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (patch.status === "paga") {
    const { data: trips } = await db.from("trips").select("id").eq("client_invoice_id", id);
    const ids = (trips ?? []).map((t) => t.id as string);
    if (ids.length) {
      await db
        .from("accounts_receivable")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "fatura" })
        .in("trip_id", ids)
        .eq("tenant_id", tenantId)
        .neq("status", "paid");
    }
  }
  if (patch.status === "cancelada") {
    await db.from("trips").update({ client_invoice_id: null }).eq("client_invoice_id", id).eq("tenant_id", tenantId);
  }
  return data as ClientInvoiceRow;
}
