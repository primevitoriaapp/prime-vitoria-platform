"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { parseCsv } from "@/lib/import/sheet-import";
import { parseOfx, parseStatementCsv, type Candidate, type StatementLine, type Suggestion } from "@/lib/finance/bank/statement-parse";
import { COMPANY_SCOPES, companyLabel, inCompany, useCompany } from "@/lib/company/company-context";
import { PAYABLE_CATEGORIES } from "@/lib/finance/company-payables-calc";

type Account = { id: string; issuer: string; bank: string; label: string; agency: string | null; account: string | null; pending: number };
type Line = {
  id: string;
  posted_at: string;
  amount: number;
  description: string;
  status: "pendente" | "conciliado" | "ignorado";
  match_kind: string | null;
  match_id: string | null;
  note: string | null;
  suggestions: Suggestion[];
};

const BANKS = ["Sicoob", "Santander", "XP Empresas", "Nubank", "Outro"];
const KIND_LABEL: Record<string, string> = {
  fatura: "Fatura",
  recebivel: "Corrida a receber",
  conta_pagar: "Conta a pagar",
  repasse: "Repasse de motorista",
  transferencia: "Transferência entre contas",
  nova_conta: "Conta criada pela conciliação",
  outro: "Outro"
};
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");

type XlsxLib = {
  read: (data: ArrayBuffer, opts: { type: "array" }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (sheet: unknown, opts: { header: 1; raw: boolean; defval: string }) => string[][] };
};
const xlsxLib = () => (window as unknown as { XLSX?: XlsxLib }).XLSX;

async function readStatement(file: File): Promise<StatementLine[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".ofx") || name.endsWith(".qfx")) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    return parseOfx(text).lines;
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    return parseStatementCsv(parseCsv(text));
  }
  if (!xlsxLib()) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Não deu para ler Excel. Exporte o extrato em OFX ou CSV."));
      document.head.appendChild(s);
    });
  }
  const X = xlsxLib()!;
  const wb = X.read(await file.arrayBuffer(), { type: "array" });
  const table = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c ?? "")));
  return parseStatementCsv(table);
}

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Financeiro → conciliação bancária: importar extrato e casar cada lançamento com o que estava em aberto. */
export function BankReconciliationPanel() {
  const { company } = useCompany();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [month, setMonth] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7));
  const [lines, setLines] = useState<Line[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNewAcc, setShowNewAcc] = useState(false);
  const [acc, setAcc] = useState({ issuer: "rj_prime", bank: "Sicoob", label: "", agency: "", account: "" });
  const [filter, setFilter] = useState<"pendente" | "todos">("pendente");

  const loadAccounts = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/finance/bank-accounts", {}, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Account[] };
    if (j.success) setAccounts(j.data ?? []);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const visibleAccounts = accounts.filter((a) => inCompany(company, a.issuer));
  useEffect(() => {
    if (!visibleAccounts.some((a) => a.id === accountId)) setAccountId(visibleAccounts[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, accounts]);

  const loadLines = useCallback(async () => {
    if (!accountId) {
      setLines([]);
      return;
    }
    const { from, to } = monthBounds(month);
    const res = await fetchWithSupabaseSession(`/api/finance/bank-statements?account=${accountId}&from=${from}&to=${to}`, {}, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: Line[]; open_candidates: Candidate[] } };
    if (j.success && j.data) {
      setLines(j.data.items);
      setCandidates(j.data.open_candidates);
    }
  }, [accountId, month]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  async function createAccount() {
    if (acc.label.trim().length < 2) {
      setMsg({ ok: false, text: "Dê um nome para a conta (ex.: Sicoob RJ Prime)." });
      return;
    }
    const res = await fetchWithSupabaseSession("/api/finance/bank-accounts", { method: "POST", body: JSON.stringify({ ...acc, agency: acc.agency || null, account: acc.account || null }) }, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Account; error?: { message?: string } };
    if (!j.success) {
      setMsg({ ok: false, text: j.error?.message ?? "Falhou." });
      return;
    }
    setShowNewAcc(false);
    setAcc({ issuer: "rj_prime", bank: "Sicoob", label: "", agency: "", account: "" });
    await loadAccounts();
    if (j.data) setAccountId(j.data.id);
  }

  async function importFile(file: File) {
    if (!accountId) return;
    setBusy(true);
    setMsg(null);
    try {
      const parsed = await readStatement(file);
      if (parsed.length === 0) throw new Error("Não achei lançamentos no arquivo. Confira se é o extrato em OFX ou CSV.");
      const res = await fetchWithSupabaseSession("/api/finance/bank-statements/import", { method: "POST", body: JSON.stringify({ bank_account_id: accountId, lines: parsed }) }, "admin");
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { inserted: number; skipped: number }; error?: { message?: string } };
      if (!j.success) throw new Error(j.error?.message ?? "Falha ao importar.");
      const months = [...new Set(parsed.map((l) => l.posted_at.slice(0, 7)))].sort();
      if (!months.includes(month)) setMonth(months[months.length - 1]);
      setMsg({ ok: true, text: `${j.data?.inserted ?? 0} lançamento(s) novo(s) importado(s)${j.data?.skipped ? `, ${j.data.skipped} já existiam` : ""}.` });
      await loadLines();
      void loadAccounts();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao ler o arquivo." });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(line: Line, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetchWithSupabaseSession(`/api/finance/bank-statements/${line.id}`, { method: "PATCH", body: JSON.stringify(body) }, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!j.success) setMsg({ ok: false, text: j.error?.message ?? "Falhou." });
    await loadLines();
    void loadAccounts();
  }

  async function autoConfirm() {
    const sure = lines.filter((l) => l.status === "pendente" && l.suggestions[0]?.score >= 90 && (l.suggestions[1]?.score ?? 0) < 90);
    if (!sure.length) {
      setMsg({ ok: false, text: "Nenhuma sugestão com 90% ou mais para confirmar sozinha." });
      return;
    }
    if (!window.confirm(`Confirmar ${sure.length} conciliação(ões) com 90% ou mais de certeza?`)) return;
    setBusy(true);
    for (const l of sure) {
      const c = l.suggestions[0].candidate;
      await fetchWithSupabaseSession(`/api/finance/bank-statements/${l.id}`, { method: "PATCH", body: JSON.stringify({ action: "conciliar", kind: c.kind, match_id: c.id }) }, "admin");
    }
    setBusy(false);
    setMsg({ ok: true, text: `${sure.length} lançamento(s) conciliado(s).` });
    await loadLines();
    void loadAccounts();
  }

  const totals = useMemo(() => {
    let inn = 0;
    let out = 0;
    let pending = 0;
    for (const l of lines) {
      if (l.amount > 0) inn += l.amount;
      else out += l.amount;
      if (l.status === "pendente") pending += 1;
    }
    return { inn, out, pending };
  }, [lines]);

  const shown = lines.filter((l) => filter === "todos" || l.status === "pendente");
  const current = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {visibleAccounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAccountId(a.id)}
            className={`rounded-2xl px-4 py-2 text-left text-sm ring-1 ${a.id === accountId ? "bg-[#111] text-[#fff] ring-[#111]" : "bg-white ring-prime-border hover:ring-prime-gold"}`}
          >
            <span className="block font-semibold">{a.label}</span>
            <span className={`block text-xs ${a.id === accountId ? "text-prime-gold" : "text-prime-muted"}`}>
              {a.bank} · {companyLabel(a.issuer)}
              {a.pending ? ` · ${a.pending} a conciliar` : ""}
            </span>
          </button>
        ))}
        <button type="button" className="rounded-2xl px-4 py-3 text-sm font-semibold text-prime-gold ring-1 ring-dashed ring-prime-border" onClick={() => setShowNewAcc((v) => !v)}>
          + Conta bancária
        </button>
      </div>

      {showNewAcc ? (
        <div className="grid gap-3 rounded-2xl border-2 border-prime-gold/60 bg-white p-4 shadow-prime-card sm:grid-cols-5">
          <label className="grid gap-1 text-sm">
            <span>Empresa</span>
            <select className={PRIME_INPUT_CLASS} value={acc.issuer} onChange={(e) => setAcc({ ...acc, issuer: e.target.value })}>
              {COMPANY_SCOPES.filter((c) => c.id !== "todas").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Banco</span>
            <select className={PRIME_INPUT_CLASS} value={acc.bank} onChange={(e) => setAcc({ ...acc, bank: e.target.value })}>
              {BANKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Nome da conta</span>
            <input className={PRIME_INPUT_CLASS} placeholder="Ex.: Sicoob RJ Prime" value={acc.label} onChange={(e) => setAcc({ ...acc, label: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Agência</span>
            <input className={PRIME_INPUT_CLASS} value={acc.agency} onChange={(e) => setAcc({ ...acc, agency: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Conta</span>
            <input className={PRIME_INPUT_CLASS} value={acc.account} onChange={(e) => setAcc({ ...acc, account: e.target.value })} />
          </label>
          <div className="sm:col-span-5">
            <button type="button" className="btn-primary" onClick={() => void createAccount()}>
              Salvar conta
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {!current ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">
          Cadastre a primeira conta bancária {company !== "todas" ? `de ${companyLabel(company)} ` : ""}para começar.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="h-9 w-9 rounded-lg bg-white ring-1 ring-prime-border" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              ‹
            </button>
            <span className="min-w-[150px] text-center font-semibold capitalize">
              {new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}
            </span>
            <button type="button" className="h-9 w-9 rounded-lg bg-white ring-1 ring-prime-border" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              ›
            </button>
            <div className="ml-2 inline-flex rounded-xl border border-prime-border bg-white p-1 text-sm">
              {(["pendente", "todos"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 ${filter === f ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}>
                  {f === "pendente" ? "A conciliar" : "Todos"}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" disabled={busy} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => void autoConfirm()}>
                ⚡ Confirmar as certeiras
              </button>
              <label className="btn-primary cursor-pointer">
                {busy ? "Lendo…" : "Importar extrato (OFX/CSV)"}
                <input
                  type="file"
                  accept=".ofx,.qfx,.csv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void importFile(f);
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs text-emerald-800">Entradas no mês</p>
              <p className="mt-1 text-xl font-semibold text-emerald-800">{brl(totals.inn)}</p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs text-red-800">Saídas no mês</p>
              <p className="mt-1 text-xl font-semibold text-red-700">{brl(totals.out)}</p>
            </div>
            <div className="rounded-2xl border border-[#111] bg-[#111] p-4">
              <p className="text-xs text-prime-gold">A conciliar</p>
              <p className="mt-1 text-xl font-semibold text-[#fff]">{totals.pending} lançamento(s)</p>
            </div>
          </div>

          <ul className="space-y-2">
            {shown.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">
                {lines.length === 0 ? "Nenhum lançamento neste mês. Importe o extrato do banco." : "Tudo conciliado neste mês. ✓"}
              </li>
            ) : null}
            {shown.map((l) => (
              <LineRow key={l.id} line={l} candidates={candidates} busy={busy} onResolve={(b) => void resolve(l, b)} />
            ))}
          </ul>
          <p className="text-xs text-prime-muted">
            Como baixar o extrato: no internet banking da empresa, procure “Extrato” → “Exportar” e escolha <b>OFX</b> (Money/Quicken). Se só tiver CSV ou
            Excel, também funciona.
          </p>
        </>
      )}
    </div>
  );
}

function LineRow({
  line,
  candidates,
  busy,
  onResolve
}: {
  line: Line;
  candidates: Candidate[];
  busy: boolean;
  onResolve: (body: Record<string, unknown>) => void;
}) {
  const [manual, setManual] = useState(false);
  const [pick, setPick] = useState("");
  const credit = line.amount > 0;
  const pool = candidates
    .filter((c) => (credit ? c.kind === "fatura" || c.kind === "recebivel" : c.kind === "conta_pagar" || c.kind === "repasse"))
    .sort((a, b) => Math.abs(a.amount - Math.abs(line.amount)) - Math.abs(b.amount - Math.abs(line.amount)));

  return (
    <li className={`rounded-2xl border bg-white p-4 shadow-prime-card ${line.status === "pendente" ? "border-prime-border" : "border-emerald-200 opacity-80"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-prime-muted">{brDate(line.posted_at)}</p>
          <p className="truncate font-medium">{line.description}</p>
        </div>
        <p className={`shrink-0 text-lg font-semibold ${credit ? "text-emerald-700" : "text-red-700"}`}>{brl(line.amount)}</p>
      </div>

      {line.status !== "pendente" ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <span className="text-emerald-800">
            ✓ {line.status === "ignorado" ? "Ignorado" : KIND_LABEL[line.match_kind ?? "outro"]}
            {line.note ? ` · ${line.note}` : ""}
          </span>
          <button type="button" disabled={busy} className="text-xs text-prime-muted hover:underline" onClick={() => onResolve({ action: "desfazer" })}>
            Desfazer
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {line.suggestions.map((s) => (
            <button
              key={`${s.candidate.kind}-${s.candidate.id}`}
              type="button"
              disabled={busy}
              onClick={() => onResolve({ action: "conciliar", kind: s.candidate.kind, match_id: s.candidate.id })}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-prime-bg px-3 py-2 text-left text-sm ring-1 ring-prime-border hover:ring-prime-gold"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  ✓ {KIND_LABEL[s.candidate.kind]}: {s.candidate.label}
                </span>
                <span className="block text-xs text-prime-muted">
                  vence {brDate(s.candidate.date)} · {s.reason}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${s.score >= 90 ? "bg-emerald-600 text-[#fff]" : "bg-amber-100 text-amber-900"}`}>
                {s.score}%
              </span>
            </button>
          ))}
          {line.suggestions.length === 0 ? <p className="text-xs text-prime-muted">Nada em aberto com esse valor.</p> : null}

          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <button type="button" className="font-semibold text-prime-gold hover:underline" onClick={() => setManual((v) => !v)}>
              Procurar na lista
            </button>
            {!credit ? (
              <button
                type="button"
                disabled={busy}
                className="font-semibold text-prime-gold hover:underline"
                onClick={() => {
                  const d = window.prompt("Descrição da conta paga:", line.description.slice(0, 120));
                  if (!d) return;
                  const cat = window.prompt(
                    `Categoria (${PAYABLE_CATEGORIES.map((c) => c.id).slice(0, 6).join(", ")}…):`,
                    /tarifa|pacote|anuidade/i.test(line.description) ? "outros" : "outros"
                  );
                  onResolve({ action: "nova_conta", description: d, category: cat || "outros" });
                }}
              >
                Lançar como conta paga
              </button>
            ) : null}
            <button type="button" disabled={busy} className="text-prime-muted hover:underline" onClick={() => onResolve({ action: "marcar", kind: "transferencia", note: "Entre contas da Prime" })}>
              Transferência entre contas
            </button>
            <button type="button" disabled={busy} className="text-prime-muted hover:underline" onClick={() => onResolve({ action: "ignorar" })}>
              Ignorar
            </button>
          </div>

          {manual ? (
            <div className="flex flex-wrap gap-2">
              <select className={`${PRIME_INPUT_CLASS} max-w-xl`} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Escolha {credit ? "a fatura ou corrida" : "a conta ou repasse"}…</option>
                {pool.slice(0, 200).map((c) => (
                  <option key={`${c.kind}|${c.id}`} value={`${c.kind}|${c.id}`}>
                    {KIND_LABEL[c.kind]} · {c.label} · {brl(c.amount)} · vence {brDate(c.date)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !pick}
                className="btn-primary disabled:opacity-40"
                onClick={() => {
                  const [kind, id] = pick.split("|");
                  onResolve({ action: "conciliar", kind, match_id: id });
                }}
              >
                Conciliar
              </button>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}
