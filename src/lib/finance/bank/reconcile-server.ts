import { db } from "@/lib/server/db";
import { updateClientInvoiceStatus } from "@/lib/finance/client-invoices";
import type { Candidate } from "@/lib/finance/bank/statement-parse";

/** Tudo em aberto que um lançamento pode quitar (da empresa da conta, ou sem empresa definida). */
export async function loadCandidates(tenantId: string, issuer: string): Promise<Candidate[]> {
  const [inv, ar, pay, dp] = await Promise.all([
    db
      .from("client_invoices")
      .select("id, total_amount, due_date, billing_issuer, client_id, number")
      .eq("tenant_id", tenantId)
      .in("status", ["aberta", "enviada"])
      .limit(1000),
    db.from("accounts_receivable").select("id, amount, due_date, client_id").eq("tenant_id", tenantId).eq("status", "open").limit(2000),
    db.from("company_payables").select("id, amount, due_date, description, supplier, issuer").eq("tenant_id", tenantId).eq("status", "aberta").limit(2000),
    db.from("driver_payables").select("id, amount, due_date, driver_id").eq("tenant_id", tenantId).eq("status", "open").limit(2000)
  ]);
  const clientIds = [...new Set([...(inv.data ?? []), ...(ar.data ?? [])].map((r) => r.client_id as string).filter(Boolean))];
  const driverIds = [...new Set((dp.data ?? []).map((r) => r.driver_id as string).filter(Boolean))];
  const [cl, dr] = await Promise.all([
    clientIds.length ? db.from("clients").select("id, name, trade_name, billing_issuer").in("id", clientIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    driverIds.length ? db.from("drivers").select("id, full_name").in("id", driverIds) : Promise.resolve({ data: [] as Record<string, unknown>[] })
  ]);
  const client = new Map((cl.data ?? []).map((c) => [c.id as string, c]));
  const driverName = new Map((dr.data ?? []).map((d) => [d.id as string, (d.full_name as string) ?? "Motorista"]));
  const sameCompany = (i: unknown) => !i || i === issuer;
  const out: Candidate[] = [];
  for (const r of inv.data ?? []) {
    const c = client.get(r.client_id as string);
    if (!sameCompany(r.billing_issuer ?? c?.billing_issuer)) continue;
    out.push({
      kind: "fatura",
      id: r.id as string,
      amount: Number(r.total_amount),
      date: String(r.due_date),
      label: `${(c?.trade_name as string) || (c?.name as string) || "Cliente"} · fatura ${String(r.number ?? "")}`
    });
  }
  for (const r of ar.data ?? []) {
    const c = client.get(r.client_id as string);
    if (!sameCompany(c?.billing_issuer)) continue;
    out.push({ kind: "recebivel", id: r.id as string, amount: Number(r.amount), date: String(r.due_date), label: `${(c?.trade_name as string) || (c?.name as string) || "Cliente"} · corrida` });
  }
  for (const r of pay.data ?? []) {
    if (!sameCompany(r.issuer)) continue;
    out.push({ kind: "conta_pagar", id: r.id as string, amount: Number(r.amount), date: String(r.due_date), label: [r.description, r.supplier].filter(Boolean).join(" · ") });
  }
  for (const r of dp.data ?? []) {
    out.push({ kind: "repasse", id: r.id as string, amount: Number(r.amount), date: String(r.due_date ?? ""), label: `Repasse · ${driverName.get(r.driver_id as string) ?? "Motorista"}` });
  }
  return out;
}

/** Dá baixa no item escolhido com a data do extrato. */
export async function settle(tenantId: string, kind: string, id: string, line: { posted_at: string; amount: number }) {
  const paidIso = new Date(`${line.posted_at}T12:00:00-03:00`).toISOString();
  if (kind === "fatura") {
    await updateClientInvoiceStatus(tenantId, id, { status: "paga" });
    await db.from("client_invoices").update({ paid_at: paidIso }).eq("id", id).eq("tenant_id", tenantId);
  } else if (kind === "recebivel") {
    await db.from("accounts_receivable").update({ status: "paid", paid_at: paidIso, payment_method: "conciliacao" }).eq("id", id).eq("tenant_id", tenantId);
  } else if (kind === "conta_pagar") {
    await db
      .from("company_payables")
      .update({ status: "paga", paid_at: line.posted_at, paid_amount: Math.abs(line.amount), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId);
  } else if (kind === "repasse") {
    await db.from("driver_payables").update({ status: "paid", paid_at: paidIso, payment_method: "conciliacao" }).eq("id", id).eq("tenant_id", tenantId);
  }
}

/** Desfaz a baixa feita pela conciliação. */
export async function unsettle(tenantId: string, kind: string, id: string) {
  if (kind === "fatura") {
    await db.from("client_invoices").update({ status: "enviada", paid_at: null }).eq("id", id).eq("tenant_id", tenantId);
  } else if (kind === "recebivel") {
    await db.from("accounts_receivable").update({ status: "open", paid_at: null }).eq("id", id).eq("tenant_id", tenantId);
  } else if (kind === "conta_pagar") {
    await db.from("company_payables").update({ status: "aberta", paid_at: null, paid_amount: null }).eq("id", id).eq("tenant_id", tenantId);
  } else if (kind === "repasse") {
    await db.from("driver_payables").update({ status: "open", paid_at: null }).eq("id", id).eq("tenant_id", tenantId);
  } else if (kind === "nova_conta") {
    await db.from("company_payables").delete().eq("id", id).eq("tenant_id", tenantId);
  }
}
