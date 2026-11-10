import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";
import { FINANCE_FILE_KINDS } from "@/lib/finance/finance-files";

export const runtime = "nodejs";
export const maxDuration = 60;

type Csv = { path: string; content: string };
type FileRef = { path: string; url: string };

const TZ = "America/Sao_Paulo";
const brDate = (iso: string | null | undefined) =>
  iso ? (iso.length === 10 ? iso.split("-").reverse().join("/") : new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ })) : "";
const money = (n: unknown) => (n == null || n === "" ? "" : Number(n).toFixed(2).replace(".", ","));
const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) => "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
const safe = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase().slice(0, 5) : "pdf");
const ISSUER: Record<string, string> = { rj_prime: "R J Prime", prime_servicos: "Prime Locadora & Serviços", ilha_prime: "Ilha Prime" };

/**
 * Pacote do contador do mês (?month=2026-11): planilhas de receitas, despesas, repasses e extratos,
 * mais a lista de arquivos (faturas em PDF, notas, boletos, comprovantes, extratos originais).
 * O navegador baixa tudo e monta um único .zip.
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("VALIDATION_ERROR", "Mês inválido", 400);
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const fromIso = new Date(`${first}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${last}T23:59:59-03:00`).toISOString();
    const csvs: Csv[] = [];
    const files: FileRef[] = [];
    const sign = async (bucket: string, path: string | null | undefined, target: string) => {
      if (!path) return;
      const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
      if (data?.signedUrl) files.push({ path: target, url: data.signedUrl });
    };

    // ---------- Receitas: faturas emitidas ou recebidas no mês ----------
    const { data: invs } = await db
      .from("client_invoices")
      .select("id, number, client_id, billing_issuer, issue_date, created_at, due_date, total_amount, status, paid_at, payment_method, nf_number, client_ref, boleto_path, nf_path, nf_extra_paths, period_start, period_end")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelada")
      .or(`and(issue_date.gte.${first},issue_date.lte.${last}),and(paid_at.gte.${fromIso},paid_at.lte.${toIso})`)
      .order("number");
    const clientIds = [...new Set((invs ?? []).map((i) => i.client_id as string))];
    const { data: cls } = clientIds.length ? await db.from("clients").select("id, name, trade_name, document").in("id", clientIds) : { data: [] as Record<string, unknown>[] };
    const client = new Map((cls ?? []).map((c) => [c.id as string, c]));
    let invIssued = 0;
    let invReceived = 0;
    const invRows: unknown[][] = [];
    for (const i of invs ?? []) {
      const c = client.get(i.client_id as string);
      const num = formatInvoiceNumber(i.number as number);
      const issue = (i.issue_date as string) || String(i.created_at).slice(0, 10);
      if (issue >= first && issue <= last) invIssued += Number(i.total_amount);
      const paidInMonth = i.paid_at && i.paid_at >= fromIso && i.paid_at <= toIso;
      if (paidInMonth) invReceived += Number(i.total_amount);
      invRows.push([
        num,
        ISSUER[i.billing_issuer as string] ?? i.billing_issuer ?? "",
        (c?.name as string) ?? "",
        (c?.document as string) ?? "",
        i.client_ref ?? "",
        brDate(issue),
        brDate(i.due_date as string),
        money(i.total_amount),
        i.status,
        brDate(i.paid_at as string | null),
        i.payment_method ?? "",
        i.nf_number ?? ""
      ]);
      const base = `01_Receitas/Faturas/Fatura_${num}_${safe(String(c?.trade_name || c?.name || "cliente"))}`;
      files.push({ path: `${base}.pdf`, url: `/api/client-invoices/${i.id}/pdf?download=1` });
      await sign("invoice-files", i.nf_path as string | null, `${base}_NotaFiscal.${extOf(String(i.nf_path ?? ""))}`);
      for (const [k, pth] of ((i.nf_extra_paths as string[] | null) ?? []).entries()) {
        await sign("invoice-files", pth, `${base}_NotaFiscal-${k + 2}.${extOf(pth)}`);
      }
      await sign("invoice-files", i.boleto_path as string | null, `${base}_Boleto.${extOf(String(i.boleto_path ?? ""))}`);
    }
    csvs.push({
      path: "01_Receitas/faturas.csv",
      content: csv(["Fatura", "Empresa emissora", "Cliente", "CNPJ/CPF", "Voucher/Ref", "Emissão", "Vencimento", "Valor", "Situação", "Pago em", "Forma", "NF nº"], invRows)
    });

    // Corridas recebidas fora de fatura (contas a receber avulsas pagas no mês).
    const { data: ars } = await db
      .from("accounts_receivable")
      .select("trip_id, client_id, amount, paid_at, payment_method, reference")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso);
    const { data: invTrips } = (ars ?? []).length
      ? await db.from("trips").select("id, client_invoice_id").in("id", (ars ?? []).map((a) => a.trip_id as string))
      : { data: [] as Record<string, unknown>[] };
    const inInvoice = new Set((invTrips ?? []).filter((t) => t.client_invoice_id).map((t) => t.id as string));
    const loose = (ars ?? []).filter((a) => !inInvoice.has(a.trip_id as string));
    const looseTotal = loose.reduce((s, a) => s + Number(a.amount), 0);
    csvs.push({
      path: "01_Receitas/corridas_recebidas_fora_de_fatura.csv",
      content: csv(["Recebido em", "Corrida", "Valor", "Forma", "Observação"], loose.map((a) => [brDate(a.paid_at as string), String(a.trip_id).slice(0, 8).toUpperCase(), money(a.amount), a.payment_method ?? "", a.reference ?? ""]))
    });

    const { data: incs } = await db
      .from("other_incomes")
      .select("id, description, category, payer, amount, received_at, received_amount, issuer, status")
      .eq("tenant_id", tenantId)
      .eq("status", "recebida")
      .gte("received_at", first)
      .lte("received_at", `${last}T23:59:59`);
    const incTotal = (incs ?? []).reduce((s, r) => s + Number(r.received_amount ?? r.amount), 0);
    csvs.push({
      path: "01_Receitas/outras_receitas.csv",
      content: csv(["Recebido em", "Descrição", "Categoria", "Pagador", "Empresa", "Valor"], (incs ?? []).map((r) => [brDate(r.received_at as string), r.description, r.category, r.payer ?? "", ISSUER[r.issuer as string] ?? r.issuer ?? "", money(r.received_amount ?? r.amount)]))
    });

    const { data: bps } = await db.from("booking_payments").select("amount, method, account, paid_on, fee_amount, notes, client_id").eq("tenant_id", tenantId).gte("paid_on", first).lte("paid_on", last);
    const bpTotal = (bps ?? []).reduce((s, r) => s + Number(r.amount), 0);
    csvs.push({
      path: "01_Receitas/pagamentos_antecipados_reservas.csv",
      content: csv(["Pago em", "Valor", "Forma", "Onde caiu", "Taxa", "Observação"], (bps ?? []).map((r) => [brDate(r.paid_on as string), money(r.amount), r.method, r.account ?? "", money(r.fee_amount), r.notes ?? ""]))
    });

    // ---------- Despesas: contas a pagar ----------
    const { data: pays } = await db
      .from("company_payables")
      .select("id, description, category, supplier, amount, due_date, status, paid_at, paid_amount, issuer, notes, payment_method")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelada")
      .or(`and(due_date.gte.${first},due_date.lte.${last}),and(paid_at.gte.${first},paid_at.lte.${last}T23:59:59)`)
      .order("due_date");
    const payIds = (pays ?? []).map((p) => p.id as string);
    const { data: pfiles } = payIds.length
      ? await db.from("finance_files").select("entity_id, kind, file_path, file_name").eq("tenant_id", tenantId).eq("entity_type", "company_payable").in("entity_id", payIds)
      : { data: [] as Record<string, unknown>[] };
    let expPaid = 0;
    const expRows: unknown[][] = [];
    for (const p of pays ?? []) {
      const fs = (pfiles ?? []).filter((f) => f.entity_id === p.id);
      if (p.status === "paga") expPaid += Number(p.paid_amount ?? p.amount);
      expRows.push([
        brDate(p.due_date as string),
        p.description,
        p.category,
        p.supplier ?? "",
        ISSUER[p.issuer as string] ?? p.issuer ?? "",
        money(p.amount),
        p.status,
        brDate(p.paid_at as string | null),
        money(p.paid_amount),
        String(p.payment_method ?? ""),
        fs.map((f) => FINANCE_FILE_KINDS[f.kind as keyof typeof FINANCE_FILE_KINDS] ?? f.kind).join(", ") || "SEM ANEXO"
      ]);
      const base = `02_Despesas/${String(p.due_date)}_${safe(String(p.description))}`;
      let k = 0;
      for (const f of fs) {
        k++;
        await sign("archive-files", f.file_path as string, `${base}_${f.kind}${k > 1 ? `_${k}` : ""}.${extOf(String(f.file_name))}`);
      }
    }
    csvs.push({
      path: "02_Despesas/contas_a_pagar.csv",
      content: csv(["Vencimento", "Descrição", "Categoria", "Fornecedor", "Empresa", "Valor", "Situação", "Pago em", "Valor pago", "Forma", "Anexos"], expRows)
    });

    // ---------- Repasses a motoristas parceiros ----------
    const { data: dps } = await db
      .from("driver_payables")
      .select("id, trip_id, driver_id, amount, paid_at, payment_method, batch_id")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .order("paid_at");
    const drvIds = [...new Set((dps ?? []).map((d) => d.driver_id as string))];
    const { data: drvs } = drvIds.length ? await db.from("drivers").select("id, full_name, cpf, partner_id").in("id", drvIds) : { data: [] as Record<string, unknown>[] };
    const ptIds = [...new Set((drvs ?? []).map((d) => d.partner_id as string).filter(Boolean))];
    const { data: pts } = ptIds.length ? await db.from("partners").select("id, name, trade_name, document").in("id", ptIds) : { data: [] as Record<string, unknown>[] };
    const drv = new Map((drvs ?? []).map((d) => [d.id as string, d]));
    const pt = new Map((pts ?? []).map((p) => [p.id as string, p]));
    const tripIds = (dps ?? []).map((d) => d.trip_id as string);
    const { data: dTrips } = tripIds.length ? await db.from("trips").select("id, scheduled_at").in("id", tripIds) : { data: [] as Record<string, unknown>[] };
    const tripAt = new Map((dTrips ?? []).map((t) => [t.id as string, t.scheduled_at as string]));
    const { data: proofs } = (dps ?? []).length
      ? await db.from("driver_payment_proofs").select("driver_payable_id, storage_url").in("driver_payable_id", (dps ?? []).map((d) => d.id as string))
      : { data: [] as Record<string, unknown>[] };
    const proofOf = new Map((proofs ?? []).map((p) => [p.driver_payable_id as string, p.storage_url as string]));
    let repTotal = 0;
    const seenProof = new Set<string>();
    const repRows: unknown[][] = [];
    for (const d of dps ?? []) {
      const dr = drv.get(d.driver_id as string);
      const p = dr?.partner_id ? pt.get(dr.partner_id as string) : null;
      const who = p ? String(p.trade_name || p.name) : String(dr?.full_name ?? "Motorista");
      repTotal += Number(d.amount);
      const proof = proofOf.get(d.id as string);
      repRows.push([brDate(d.paid_at as string), who, (p?.document as string) ?? (dr?.cpf as string) ?? "", dr?.full_name ?? "", brDate(tripAt.get(d.trip_id as string) ?? null), money(d.amount), d.payment_method ?? "", d.batch_id ?? "", proof ? "sim" : "NÃO"]);
      if (proof && /^https?:\/\//.test(proof) && !seenProof.has(proof)) {
        seenProof.add(proof);
        files.push({ path: `03_Repasses/Comprovantes/${String(d.paid_at).slice(0, 10)}_${safe(who)}_${seenProof.size}.${/\.(png|jpe?g|webp)\?/i.test(proof) ? proof.match(/\.(png|jpe?g|webp)\?/i)![1] : "pdf"}`, url: proof });
      }
    }
    csvs.push({
      path: "03_Repasses/repasses_motoristas.csv",
      content: csv(["Pago em", "Favorecido", "CNPJ/CPF", "Motorista", "Data da corrida", "Valor", "Forma", "Lote", "Comprovante"], repRows)
    });

    // ---------- Extratos ----------
    const { data: accs } = await db.from("bank_accounts").select("id, label, bank, issuer").eq("tenant_id", tenantId);
    for (const a of accs ?? []) {
      const { data: lines } = await db
        .from("bank_statement_lines")
        .select("posted_at, amount, description, status, match_kind, note")
        .eq("bank_account_id", a.id as string)
        .gte("posted_at", first)
        .lte("posted_at", last)
        .order("posted_at")
        .limit(5000);
      if (!(lines ?? []).length) continue;
      csvs.push({
        path: `04_Extratos/${safe(String(a.label || a.bank))}.csv`,
        content: csv(["Data", "Descrição", "Valor", "Conciliado", "Ligado a", "Observação"], (lines ?? []).map((l) => [brDate(l.posted_at as string), l.description, money(l.amount), l.status, l.match_kind ?? "", l.note ?? ""]))
      });
    }
    const { data: arch } = await db.from("archive_files").select("file_path, file_name, period, notes, category").eq("tenant_id", tenantId).in("category", ["extratos_mes", "notas_fiscais"]);
    for (const f of arch ?? []) {
      if (!String(f.period ?? "").includes(month)) continue;
      const folder = f.category === "notas_fiscais" ? "05_Notas_fiscais" : "04_Extratos/Arquivos_originais";
      await sign("archive-files", f.file_path as string, `${folder}/${safe(String(f.notes ?? ""))}_${safe(String(f.file_name))}`);
    }

    // ---------- Resumo ----------
    const missingExp = expRows.filter((r) => r[10] === "SEM ANEXO").length;
    const missingRep = repRows.filter((r) => r[8] === "NÃO").length;
    const summary = {
      month,
      faturas_emitidas: Math.round(invIssued * 100) / 100,
      faturas_recebidas: Math.round(invReceived * 100) / 100,
      corridas_recebidas_fora_de_fatura: Math.round(looseTotal * 100) / 100,
      outras_receitas: Math.round(incTotal * 100) / 100,
      pagamentos_antecipados: Math.round(bpTotal * 100) / 100,
      despesas_pagas: Math.round(expPaid * 100) / 100,
      repasses_pagos: Math.round(repTotal * 100) / 100,
      despesas_sem_anexo: missingExp,
      repasses_sem_comprovante: missingRep,
      arquivos: files.length
    };
    csvs.unshift({
      path: "00_RESUMO.csv",
      content: csv(
        ["Item", "Valor"],
        [
          ["Mês", `${String(m).padStart(2, "0")}/${y}`],
          ["Faturas emitidas no mês", money(summary.faturas_emitidas)],
          ["Faturas recebidas no mês", money(summary.faturas_recebidas)],
          ["Corridas recebidas fora de fatura", money(summary.corridas_recebidas_fora_de_fatura)],
          ["Outras receitas recebidas", money(summary.outras_receitas)],
          ["Pagamentos antecipados (reservas)", money(summary.pagamentos_antecipados)],
          ["Despesas pagas (contas a pagar)", money(summary.despesas_pagas)],
          ["Repasses pagos a motoristas", money(summary.repasses_pagos)],
          ["Despesas sem anexo", String(missingExp)],
          ["Repasses sem comprovante", String(missingRep)]
        ]
      )
    });
    return ok({ summary, csvs, files });
  } catch (e) {
    return mapApiError(e);
  }
}
