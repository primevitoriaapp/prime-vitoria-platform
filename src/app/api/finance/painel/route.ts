import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { staffFinance } from "@/lib/finance/company-payables-schema";
import { buildFinanceReport, lastMonths, monthlySeries } from "@/lib/finance/finance-report";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => Number(v ?? 0) || 0;
const day = (iso: string | null | undefined) =>
  !iso ? null : /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await run(ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** Painel financeiro: DRE, caixa, previsão 30/60/90, inadimplência e margem por cliente. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staffFinance(session.role)) return fail("FORBIDDEN", "Sem acesso ao financeiro", 403);
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const today = day(new Date().toISOString()) as string;
    const from = YMD.test(url.searchParams.get("from") ?? "") ? (url.searchParams.get("from") as string) : `${today.slice(0, 7)}-01`;
    const to = YMD.test(url.searchParams.get("to") ?? "") ? (url.searchParams.get("to") as string) : today;
    const empresa = url.searchParams.get("empresa") ?? "todas";
    const fromIso = new Date(`${from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59.999-03:00`).toISOString();

    const months = lastMonths(today, 12);
    const monthsFromIso = new Date(`${months[0]}-01T00:00:00-03:00`).toISOString();
    const [clientsRes, tripsRes, invRes, recRes, payRes, drvRes, othRes, yearTripsRes, yearPayRes] = await Promise.all([
      db.from("clients").select("id, name, trade_name, billing_issuer").eq("tenant_id", tenantId).limit(5000),
      db
        .from("trips")
        .select("id, client_id, scheduled_at, client_amount, driver_amount, client_invoice_id")
        .eq("tenant_id", tenantId)
        .eq("operational_status", "completed")
        .gte("scheduled_at", fromIso)
        .lte("scheduled_at", toIso)
        .limit(5000),
      db
        .from("client_invoices")
        .select("id, client_id, billing_issuer, issue_date, due_date, total_amount, status, paid_at")
        .eq("tenant_id", tenantId)
        .or(`status.in.(aberta,enviada),and(status.eq.paga,paid_at.gte.${fromIso},paid_at.lte.${toIso})`)
        .limit(5000),
      db
        .from("accounts_receivable")
        .select("id, trip_id, client_id, due_date, amount, status, paid_at")
        .eq("tenant_id", tenantId)
        .or(`status.eq.open,and(status.eq.paid,paid_at.gte.${fromIso},paid_at.lte.${toIso})`)
        .limit(5000),
      db
        .from("company_payables")
        .select("id, issuer, category, due_date, amount, status, paid_at, paid_amount")
        .eq("tenant_id", tenantId)
        .neq("status", "cancelada")
        .or(`status.eq.aberta,and(due_date.gte.${from},due_date.lte.${to}),and(paid_at.gte.${fromIso},paid_at.lte.${toIso})`)
        .limit(5000),
      db
        .from("driver_payables")
        .select("id, trip_id, due_date, amount, status, paid_at")
        .eq("tenant_id", tenantId)
        .or(`status.eq.open,and(status.eq.paid,paid_at.gte.${fromIso},paid_at.lte.${toIso})`)
        .limit(5000),
      db.from("other_incomes").select("id, client_id, issuer, category, due_date, amount, status, received_at, received_amount").eq("tenant_id", tenantId).neq("status", "cancelada").limit(5000),
      db
        .from("trips")
        .select("client_id, scheduled_at, client_amount, driver_amount")
        .eq("tenant_id", tenantId)
        .eq("operational_status", "completed")
        .gte("scheduled_at", monthsFromIso)
        .limit(20000),
      db.from("company_payables").select("issuer, due_date, amount, status, paid_amount").eq("tenant_id", tenantId).neq("status", "cancelada").gte("due_date", `${months[0]}-01`).limit(20000)
    ]);
    for (const r of [clientsRes, tripsRes, invRes, recRes, payRes, drvRes]) if (r.error) return fail("LOAD_FAILED", r.error.message, 500);

    const clients = clientsRes.data ?? [];
    const issuerOf = new Map(clients.map((c) => [c.id as string, (c.billing_issuer as string | null) ?? null]));
    const clientNames = Object.fromEntries(clients.map((c) => [c.id as string, (c.trade_name as string) || (c.name as string)]));
    const pass = (issuer: string | null | undefined) => empresa === "todas" || issuer === empresa;

    // Ligações corrida → fatura/cliente para recebíveis e repasses.
    const recTripIds = [...new Set((recRes.data ?? []).map((r) => r.trip_id as string).filter(Boolean))];
    const drvTripIds = [...new Set((drvRes.data ?? []).map((r) => r.trip_id as string).filter(Boolean))];
    const linkRows = await inChunks<{ id: string; client_id: string; client_invoice_id: string | null }>(
      [...new Set([...recTripIds, ...drvTripIds])],
      (chunk) => db.from("trips").select("id, client_id, client_invoice_id").in("id", chunk)
    );
    const tripLink = new Map(linkRows.map((t) => [t.id, t]));

    const report = buildFinanceReport({
      from,
      to,
      today,
      clientNames,
      trips: (tripsRes.data ?? [])
        .map((t) => ({
          id: t.id as string,
          client_id: t.client_id as string,
          issuer: issuerOf.get(t.client_id as string) ?? null,
          completed_on: day(t.scheduled_at as string) as string,
          client_amount: num(t.client_amount),
          driver_amount: num(t.driver_amount),
          invoiced: Boolean(t.client_invoice_id)
        }))
        .filter((t) => pass(t.issuer)),
      invoices: (invRes.data ?? [])
        .map((i) => ({
          id: i.id as string,
          client_id: i.client_id as string,
          issuer: (i.billing_issuer as string | null) ?? issuerOf.get(i.client_id as string) ?? null,
          issue_date: i.issue_date as string,
          due_date: i.due_date as string,
          total: num(i.total_amount),
          status: i.status as string,
          paid_on: day(i.paid_at as string | null)
        }))
        .filter((i) => pass(i.issuer)),
      receivables: (recRes.data ?? [])
        .map((r) => ({
          id: r.id as string,
          client_id: r.client_id as string,
          issuer: issuerOf.get(r.client_id as string) ?? null,
          due_date: r.due_date as string,
          amount: num(r.amount),
          status: r.status as string,
          paid_on: day(r.paid_at as string | null),
          invoiced: Boolean(tripLink.get(r.trip_id as string)?.client_invoice_id)
        }))
        .filter((r) => pass(r.issuer)),
      payables: (payRes.data ?? [])
        .map((p) => ({
          id: p.id as string,
          issuer: (p.issuer as string | null) ?? null,
          category: (p.category as string) || "outros",
          due_date: p.due_date as string,
          amount: num(p.amount),
          status: p.status as string,
          paid_on: day(p.paid_at as string | null),
          paid_amount: p.paid_amount == null ? null : num(p.paid_amount)
        }))
        .filter((p) => pass(p.issuer)),
      driverPayables: (drvRes.data ?? [])
        .map((d) => ({
          id: d.id as string,
          issuer: issuerOf.get(tripLink.get(d.trip_id as string)?.client_id ?? "") ?? null,
          due_date: (d.due_date as string | null) ?? null,
          amount: num(d.amount),
          status: d.status as string,
          paid_on: day(d.paid_at as string | null)
        }))
        .filter((d) => pass(d.issuer)),
      otherIncomes: (othRes.data ?? [])
        .filter((o) => pass((o.issuer as string | null) ?? issuerOf.get(o.client_id as string) ?? null))
        .map((o) => ({
          id: o.id as string,
          due_date: o.due_date as string,
          amount: num(o.amount),
          status: o.status as string,
          received_on: (o.received_at as string | null) ?? null,
          received_amount: o.received_amount == null ? null : num(o.received_amount),
          category: (o.category as string) ?? "outros"
        }))
    });

    const monthly = monthlySeries(
      months,
      (yearTripsRes.data ?? [])
        .filter((t) => pass(issuerOf.get(t.client_id as string) ?? null))
        .map((t) => ({ completed_on: day(t.scheduled_at as string) as string, client_amount: num(t.client_amount), driver_amount: num(t.driver_amount) })),
      (yearPayRes.data ?? [])
        .filter((p) => pass((p.issuer as string | null) ?? null))
        .map((p) => ({ due_date: p.due_date as string, amount: num(p.amount), status: p.status as string, paid_amount: p.paid_amount == null ? null : num(p.paid_amount) })),
      (othRes.data ?? [])
        .filter((o) => pass((o.issuer as string | null) ?? issuerOf.get(o.client_id as string) ?? null))
        .map((o) => ({ due_date: o.due_date as string, amount: num(o.amount), status: o.status as string, received_amount: o.received_amount == null ? null : num(o.received_amount) }))
    );

    // Saldo nas contas bancárias (saldo inicial + extratos importados).
    let banks: { id: string; label: string; bank: string; issuer: string; balance: number; balance_date: string | null }[] = [];
    {
      const { data: accs } = await db.from("bank_accounts").select("id, label, bank, issuer, opening_balance, opening_date").eq("tenant_id", tenantId).eq("active", true);
      const list = (accs ?? []).filter((a) => pass(a.issuer as string));
      if (list.length) {
        const { data: lines } = await db.from("bank_statement_lines").select("bank_account_id, amount, posted_at").in("bank_account_id", list.map((a) => a.id as string)).limit(50000);
        banks = list.map((a) => {
          const od = (a.opening_date as string | null) ?? null;
          const mine = (lines ?? []).filter((l) => l.bank_account_id === a.id && (!od || (l.posted_at as string) > od));
          const last = mine.reduce<string | null>((m, l) => (!m || (l.posted_at as string) > m ? (l.posted_at as string) : m), od);
          return {
            id: a.id as string,
            label: a.label as string,
            bank: a.bank as string,
            issuer: a.issuer as string,
            balance: Math.round((num(a.opening_balance) + mine.reduce((s2, l) => s2 + num(l.amount), 0)) * 100) / 100,
            balance_date: last
          };
        });
      }
    }

    return ok({ from, to, today, empresa, ...report, monthly, banks });
  } catch (error) {
    return mapApiError(error);
  }
}
