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
  client_ref?: string | null;
  voucher_path?: string | null;
  boleto_path?: string | null;
  nf_path?: string | null;
  nf_extra_paths?: string[] | null;
  payment_method?: string | null;
  viewed_at?: string | null;
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
  /** Vencimento do boleto escolhido no fechamento (senão, o prazo do cadastro). */
  dueDate?: string | null;
}): Promise<GenerateResult[]> {
  const { fromIso, toIso } = periodUtcBounds(input.periodStart, input.periodEnd);
  let q = db
    .from("trips")
    .select("id, client_id, scheduled_at, client_amount, km_billable, actual_km, planned_km")
    .eq("tenant_id", input.tenantId)
    // Só entra na fatura corrida aprovada pelo gestor (KM e valores conferidos).
    .not("reviewed_at", "is", null)
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
    .select("id, name, trade_name, payment_term_days, billing_issuer, invoiced, invoice_per_service")
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
    // Cliente que fecha por voucher (ex.: CEP) nunca entra no fechamento do mês: fecha um NR por vez em "Vouchers a fechar".
    if (c?.invoice_per_service) {
      results.push({
        client_id: clientId,
        client_name: name,
        trip_count: summary.trip_count,
        total_amount: summary.total_amount,
        trips_without_amount: summary.trips_without_amount,
        skipped: "fecha por voucher — use o quadro Vouchers a fechar (um NR por vez)"
      });
      continue;
    }
    const due = input.dueDate || invoiceDueDate(input.periodEnd, (c?.payment_term_days as number | null) ?? null);

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

    await import("@/lib/finance/driver-payout-sync")
      .then(({ resyncOpenDriverPayoutDates }) => resyncOpenDriverPayoutDates(input.tenantId, { tripIds: ids }))
      .catch(() => undefined);

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
      "id, scheduled_at, service_type, passenger_name, passenger_count, origin_text, destination_text, flight_number, cost_center_id, client_amount, km_billable, actual_km, planned_km, wait_minutes, created_by, notes, trip_dropoff_stops, calculation_metadata, invoice_merge_key"
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
    due_date?: string;
    /** Dia em que o dinheiro entrou (YYYY-MM-DD). Sem ele, hoje. */
    paid_on?: string;
    payment_method?: string | null;
  }
) {
  const update: Record<string, unknown> = {};
  if (patch.payment_method !== undefined) update.payment_method = patch.payment_method;
  if (patch.due_date) update.due_date = patch.due_date;
  if (patch.boleto_url !== undefined) update.boleto_url = patch.boleto_url;
  if (patch.boleto_line !== undefined) update.boleto_line = patch.boleto_line;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.nf_number !== undefined) update.nf_number = patch.nf_number;
  if (patch.nf_url !== undefined) update.nf_url = patch.nf_url;
  if (patch.status) {
    update.status = patch.status;
    if (patch.status === "enviada") update.sent_at = new Date().toISOString();
    if (patch.status === "paga") update.paid_at = patch.paid_on ? new Date(`${patch.paid_on}T12:00:00-03:00`).toISOString() : new Date().toISOString();
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
        .update({ status: "paid", paid_at: (update.paid_at as string) ?? new Date().toISOString(), payment_method: patch.payment_method ?? "fatura" })
        .in("trip_id", ids)
        .eq("tenant_id", tenantId)
        .neq("status", "paid");
    }
  }
  if (patch.status === "cancelada") {
    await db.from("trips").update({ client_invoice_id: null }).eq("client_invoice_id", id).eq("tenant_id", tenantId);
  }
  if (patch.due_date && patch.status !== "cancelada") {
    // Vencimento mudou: contas a receber e data prevista do repasse ao motorista acompanham.
    const { data: invTrips } = await db.from("trips").select("id").eq("tenant_id", tenantId).eq("client_invoice_id", id).limit(5000);
    const ids = (invTrips ?? []).map((t) => t.id as string);
    if (ids.length) {
      await db.from("accounts_receivable").update({ due_date: patch.due_date }).in("trip_id", ids).eq("tenant_id", tenantId).neq("status", "paid");
      await import("@/lib/finance/driver-payout-sync")
        .then(({ resyncOpenDriverPayoutDates }) => resyncOpenDriverPayoutDates(tenantId, { tripIds: ids }))
        .catch(() => undefined);
    }
  }
  if (patch.status === "paga" || patch.status === "cancelada") {
    // Cliente pagou (ou a fatura caiu): a data prevista do repasse ao motorista muda junto.
    let tripIds: string[] | undefined;
    if (patch.status === "paga") {
      const { data: invTrips } = await db.from("trips").select("id").eq("tenant_id", tenantId).eq("client_invoice_id", id).limit(5000);
      tripIds = (invTrips ?? []).map((t) => t.id as string);
    }
    if (!tripIds || tripIds.length) {
      await import("@/lib/finance/driver-payout-sync")
        .then(({ resyncOpenDriverPayoutDates }) => resyncOpenDriverPayoutDates(tenantId, tripIds ? { tripIds } : {}))
        .catch(() => undefined);
    }
  }
  return data as ClientInvoiceRow;
}

/** "NR263261-C1" → "NR263261": todos os itens/trechos (B, C1, C2…) do mesmo voucher vão na mesma fatura. */
export function baseClientRef(ref: string | null | undefined): string | null {
  const r = String(ref ?? "").trim().toUpperCase();
  if (!r) return null;
  return r.split("-")[0] || r;
}

/**
 * Fatura de UM serviço (voucher/NR): a corrida escolhida e os outros trechos concluídos do mesmo voucher.
 * Para clientes que fecham por serviço (ex.: CEP).
 */
export async function generateInvoiceForTrip(input: {
  tenantId: string;
  tripId: string;
  dueDate: string;
  createdBy?: string | null;
}): Promise<{ invoice_id: string; number: number; trip_ids: string[]; total_amount: number }> {
  const { clientRefFromNotes } = await import("@/lib/trips/client-ref");
  const { data: trip } = await db
    .from("trips")
    .select("id, client_id, scheduled_at, notes, operational_status, client_invoice_id, client_voucher_path")
    .eq("id", input.tripId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!trip) throw new Error("Corrida não encontrada");
  if (trip.operational_status !== "completed") throw new Error("A corrida ainda não foi concluída");
  if (trip.client_invoice_id) throw new Error("Esta corrida já está numa fatura");

  const ref = clientRefFromNotes(trip.notes as string | null);
  const base = baseClientRef(ref);
  let list: { id: string; scheduled_at: string; client_amount: number | null; km_billable: number | null; actual_km: number | null; planned_km: number | null; client_voucher_path: string | null }[] = [];
  if (base) {
    const { data } = await db
      .from("trips")
      .select("id, scheduled_at, notes, client_amount, km_billable, actual_km, planned_km, client_voucher_path")
      .eq("tenant_id", input.tenantId)
      .eq("client_id", trip.client_id)
      .eq("operational_status", "completed")
      .is("client_invoice_id", null)
      .ilike("notes", `%${base.replace(/[%_]/g, "")}%`)
      .limit(50);
    list = ((data ?? []) as (typeof list[number] & { notes: string | null })[]).filter((t) => baseClientRef(clientRefFromNotes(t.notes)) === base);
  }
  // Voucher só fecha inteiro: algum item ainda não concluído (e não cancelado) segura a fatura.
  if (base) {
    const { data: pend } = await db
      .from("trips")
      .select("id, notes, scheduled_at, operational_status")
      .eq("tenant_id", input.tenantId)
      .eq("client_id", trip.client_id)
      .is("client_invoice_id", null)
      .not("operational_status", "in", "(completed,cancelled,rejected,no_show)")
      .ilike("notes", `%${base.replace(/[%_]/g, "")}%`)
      .limit(50);
    const open = (pend ?? []).filter((t) => baseClientRef(clientRefFromNotes(t.notes as string | null)) === base);
    if (open.length)
      throw new Error(
        `O voucher ${base} ainda tem ${open.length} serviço(s) sem concluir (${open
          .map((t) => clientRefFromNotes(t.notes as string | null))
          .join(", ")}). Feche quando todos terminarem.`
      );
  }
  {
    const ids = [...new Set([...list.map((t) => t.id), trip.id])];
    const { data: notOk } = await db.from("trips").select("id, notes").in("id", ids).is("reviewed_at", null);
    if (notOk?.length)
      throw new Error(
        `Falta aprovar ${notOk.length} corrida(s) deste voucher em "Aprovar corridas" (${notOk
          .map((t) => clientRefFromNotes(t.notes as string | null) ?? String(t.id).slice(0, 8))
          .join(", ")}).`
      );
  }
  if (!list.some((t) => t.id === trip.id)) {
    const { data: self } = await db
      .from("trips")
      .select("id, scheduled_at, client_amount, km_billable, actual_km, planned_km, client_voucher_path")
      .eq("id", trip.id)
      .single();
    list.push(self as typeof list[number]);
  }

  const days = list.map((t) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(t.scheduled_at))).sort();
  const summary = summarizeInvoice(list as unknown as InvoiceTripInput[]);
  const { data: c } = await db.from("clients").select("billing_issuer").eq("id", trip.client_id).maybeSingle();
  const { data: inv, error } = await db
    .from("client_invoices")
    .insert({
      tenant_id: input.tenantId,
      client_id: trip.client_id,
      period_start: days[0],
      period_end: days[days.length - 1],
      due_date: input.dueDate,
      billing_issuer: (c?.billing_issuer as string | null) ?? null,
      trip_count: summary.trip_count,
      total_km: summary.total_km,
      total_amount: summary.total_amount,
      created_by: input.createdBy ?? null,
      client_ref: base ?? ref ?? null,
      voucher_path: list.find((t) => t.client_voucher_path)?.client_voucher_path ?? null
    })
    .select("id, number")
    .single();
  if (error || !inv) {
    if (/uq_client_invoices_period/.test(error?.message ?? ""))
      throw new Error("Já existe outra fatura deste cliente para o mesmo dia. Peça para liberar faturas por voucher no mesmo dia (script do banco).");
    throw new Error(error?.message ?? "Falha ao criar a fatura");
  }
  const ids = list.map((t) => t.id);
  await db.from("trips").update({ client_invoice_id: inv.id }).in("id", ids).eq("tenant_id", input.tenantId);
  await db
    .from("accounts_receivable")
    .update({ due_date: input.dueDate, reference: `Fatura ${String(inv.number).padStart(5, "0")}${base ? ` · ${base}` : ""}` })
    .in("trip_id", ids)
    .eq("tenant_id", input.tenantId)
    .neq("status", "paid");
  await import("@/lib/finance/driver-payout-sync")
    .then(({ resyncOpenDriverPayoutDates }) => resyncOpenDriverPayoutDates(input.tenantId, { tripIds: ids }))
    .catch(() => undefined);
  return { invoice_id: inv.id as string, number: inv.number as number, trip_ids: ids, total_amount: summary.total_amount };
}

/** Fatura com as corridas escolhidas (um voucher ou os serviços de um dia). Todas do mesmo cliente, concluídas e aprovadas. */
export async function generateInvoiceFromTrips(input: {
  tenantId: string;
  tripIds: string[];
  dueDate: string;
  clientRef?: string | null;
  createdBy?: string | null;
}): Promise<{ invoice_id: string; number: number; trip_ids: string[]; total_amount: number }> {
  const ids = [...new Set(input.tripIds)];
  if (!ids.length) throw new Error("Nenhuma corrida escolhida");
  const { data: trips } = await db
    .from("trips")
    .select("id, client_id, scheduled_at, operational_status, client_invoice_id, reviewed_at, client_amount, km_billable, actual_km, planned_km, client_voucher_path")
    .eq("tenant_id", input.tenantId)
    .in("id", ids);
  const list = trips ?? [];
  if (list.length !== ids.length) throw new Error("Alguma corrida não foi encontrada");
  const clients = new Set(list.map((t) => t.client_id as string));
  if (clients.size !== 1) throw new Error("As corridas precisam ser do mesmo cliente");
  if (list.some((t) => t.operational_status !== "completed")) throw new Error("Ainda tem corrida sem concluir neste grupo");
  if (list.some((t) => t.client_invoice_id)) throw new Error("Alguma corrida já está em outra fatura");
  if (list.some((t) => !t.reviewed_at)) throw new Error('Falta aprovar corrida deste grupo em "Aprovar corridas"');
  const clientId = list[0].client_id as string;
  const days = list.map((t) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(t.scheduled_at as string))).sort();
  const summary = summarizeInvoice(list as unknown as InvoiceTripInput[]);
  const { data: c } = await db.from("clients").select("billing_issuer").eq("id", clientId).maybeSingle();
  let ref = input.clientRef ?? null;
  let inv: { id: string; number: number } | null = null;
  for (let attempt = 1; attempt <= 5 && !inv; attempt++) {
    const { data, error } = await db
      .from("client_invoices")
      .insert({
        tenant_id: input.tenantId,
        client_id: clientId,
        period_start: days[0],
        period_end: days[days.length - 1],
        due_date: input.dueDate,
        billing_issuer: (c?.billing_issuer as string | null) ?? null,
        trip_count: summary.trip_count,
        total_km: summary.total_km,
        total_amount: summary.total_amount,
        created_by: input.createdBy ?? null,
        client_ref: ref,
        voucher_path: list.find((t) => t.client_voucher_path)?.client_voucher_path ?? null
      })
      .select("id, number")
      .single();
    if (data) inv = { id: data.id as string, number: data.number as number };
    else if (/uq_client_invoices_period/.test(error?.message ?? "")) ref = `${input.clientRef ?? "Lote"} (${attempt + 1})`;
    else throw new Error(error?.message ?? "Falha ao criar a fatura");
  }
  if (!inv) throw new Error("Não foi possível criar a fatura");
  await db.from("trips").update({ client_invoice_id: inv.id }).in("id", ids).eq("tenant_id", input.tenantId);
  await db
    .from("accounts_receivable")
    .update({ due_date: input.dueDate, reference: `Fatura ${String(inv.number).padStart(5, "0")}${ref ? ` · ${ref}` : ""}` })
    .in("trip_id", ids)
    .eq("tenant_id", input.tenantId)
    .neq("status", "paid");
  await import("@/lib/finance/driver-payout-sync")
    .then(({ resyncOpenDriverPayoutDates }) => resyncOpenDriverPayoutDates(input.tenantId, { tripIds: ids }))
    .catch(() => undefined);
  return { invoice_id: inv.id, number: inv.number, trip_ids: ids, total_amount: summary.total_amount };
}
