"use client";

import { VouchersToCloseCard } from "@/components/vouchers-to-close-card";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { inCompany, useCompany } from "@/lib/company/company-context";
import { INVOICE_STATUS_LABEL, formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

type Row = {
  id: string;
  number: number;
  client_ref?: string | null;
  client_id: string;
  client_name?: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  trip_count: number;
  total_km: number;
  total_amount: number;
  status: "aberta" | "enviada" | "paga" | "cancelada";
  boleto_url: string | null;
  boleto_line: string | null;
  nf_number: string | null;
  nf_url: string | null;
  billing_issuer?: string | null;
  boleto_path?: string | null;
  nf_path?: string | null;
  voucher_path?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  payouts?: { driver: string; amount: number; due_date: string | null; status: string }[];
};

type Props = { devFallbackRole?: "admin" | "financeiro" };

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");

function prevMonth() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Financeiro → fechamento mensal: gera faturas, envia, anexa boleto e dá baixa. */
export function ClientInvoicesAdminPanel({ devFallbackRole = "admin" }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const { company } = useCompany();
  const [month, setMonth] = useState(prevMonth);
  const [mode, setMode] = useState<"mes" | "periodo">("mes");
  const [pStart, setPStart] = useState("");
  const [pEnd, setPEnd] = useState("");
  const [clientId, setClientId] = useState("");
  const [due, setDue] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string; trade_name?: string | null }[]>([]);
  const [editDue, setEditDue] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    void fetchWithSupabaseSession("/api/clients", {}, devFallbackRole)
      .then((r) => r.json())
      .then((j: { data?: { id: string; name: string; trade_name?: string | null; active?: boolean }[] }) => setClients((j.data ?? []).filter((c) => c.active !== false)))
      .catch(() => setClients([]));
  }, [devFallbackRole]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/client-invoices", {}, devFallbackRole);
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
    if (res.ok && json.success) setRows(json.data ?? []);
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const period =
      mode === "mes"
        ? { period_start: `${month}-01`, period_end: `${month}-${String(last).padStart(2, "0")}` }
        : { period_start: pStart, period_end: pEnd };
    if (!period.period_start || !period.period_end) {
      setMsg({ kind: "err", text: "Escolha o período (de / até)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetchWithSupabaseSession(
      "/api/client-invoices/generate",
      {
        method: "POST",
        body: JSON.stringify({ ...period, ...(clientId ? { client_id: clientId } : {}), ...(due ? { due_date: due } : {}) })
      },
      devFallbackRole
    );
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { results: { client_name: string; invoice_id?: string; trip_count: number; total_amount: number; trips_without_amount: number; skipped?: string }[] };
      error?: { message?: string };
    };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMsg({ kind: "err", text: json.error?.message ?? "Não foi possível gerar as faturas." });
      return;
    }
    const results = json.data?.results ?? [];
    if (results.length === 0) {
      setMsg({ kind: "ok", text: "Nenhuma corrida concluída sem fatura neste mês." });
    } else {
      const created = results.filter((r) => r.invoice_id);
      const warn = results.filter((r) => r.trips_without_amount > 0).map((r) => `${r.client_name} (${r.trips_without_amount} sem valor)`);
      const skipped = results.filter((r) => r.skipped).map((r) => `${r.client_name}: ${r.skipped}`);
      setMsg({
        kind: skipped.length ? "err" : "ok",
        text: [
          `${created.length} fatura(s) gerada(s).`,
          warn.length ? `Atenção, corridas sem valor: ${warn.join(", ")}.` : "",
          skipped.join(" ")
        ]
          .filter(Boolean)
          .join(" ")
      });
    }
    void load();
  }

  async function patch(id: string, body: Record<string, unknown>, okText: string) {
    setBusy(true);
    const res = await fetchWithSupabaseSession(`/api/client-invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }, devFallbackRole);
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    setMsg(res.ok && json.success ? { kind: "ok", text: okText } : { kind: "err", text: json.error?.message ?? "Falha ao salvar." });
    void load();
  }

  async function send(id: string) {
    setBusy(true);
    const res = await fetchWithSupabaseSession(`/api/client-invoices/${id}/send`, { method: "POST" }, devFallbackRole);
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { sent_to: string[] }; error?: { message?: string } };
    setBusy(false);
    setMsg(
      res.ok && json.success
        ? { kind: "ok", text: `Fatura enviada para ${json.data?.sent_to.join(", ")}.` }
        : { kind: "err", text: json.error?.message ?? "Falha ao enviar." }
    );
    void load();
  }

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ row: Row; kind: "boleto" | "nf" } | null>(null);

  function pickFile(r: Row, kind: "boleto" | "nf") {
    setPendingUpload({ row: r, kind });
    fileRef.current?.click();
  }

  async function uploadFile(file: File) {
    const target = pendingUpload;
    setPendingUpload(null);
    if (!target) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("kind", target.kind);
    fd.append("file", file);
    const res = await fetchWithSupabaseSession(`/api/client-invoices/${target.row.id}/files`, { method: "POST", body: fd }, devFallbackRole);
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMsg({ kind: "err", text: json.error?.message ?? "Falha ao anexar o arquivo." });
      return;
    }
    if (target.kind === "boleto") {
      const line = window.prompt("Boleto anexado. Quer colar a linha digitável também? (opcional)", target.row.boleto_line ?? "")?.trim();
      if (line !== undefined) await patch(target.row.id, { boleto_line: line || null }, "Boleto anexado à fatura. O cliente já vê no portal.");
      else setMsg({ kind: "ok", text: "Boleto anexado à fatura. O cliente já vê no portal." });
    } else {
      const number = window.prompt("Nota anexada. Qual o número da nota fiscal?", target.row.nf_number ?? "")?.trim();
      if (number !== undefined) await patch(target.row.id, { nf_number: number || null }, "Nota fiscal anexada à fatura.");
      else setMsg({ kind: "ok", text: "Nota fiscal anexada à fatura." });
    }
    void load();
  }

  return (
    <section className="mb-6 space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadFile(f);
          else setPendingUpload(null);
        }}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Faturas dos clientes</h2>
          <p className="text-sm text-prime-muted">
            As empresas com fechamento automático (cadastro do cliente) têm a fatura criada sozinha no dia seguinte ao fechamento. Para fechar na mão: escolha o mês ou o período, o cliente e o vencimento do boleto. O vencimento define a data em que o motorista recebe (aparece na carteira dele). Clique no vencimento de uma fatura para alterar.
          </p>
        </div>
      </div>

      <VouchersToCloseCard onClosed={() => void load()} />

      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Fechamento do mês (clientes mensais)</p>
      <div className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
        <div className="grid gap-1 text-xs">
          Fechamento
          <div className="flex gap-1">
            {(
              [
                ["mes", "Mês inteiro"],
                ["periodo", "Período"]
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-md px-2 py-1.5 text-sm ring-1 ${mode === id ? "bg-[#111] text-[#fff] ring-[#111]" : "ring-prime-border"}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === "mes" ? (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm" />
          ) : (
            <div className="flex items-center gap-1">
              <input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm" />
              <span>até</span>
              <input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>
        <label className="grid gap-1 text-xs">
          Cliente
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm">
            <option value="">Todos os clientes faturados</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.trade_name || c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          Vencimento do boleto
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm" />
          <span className="text-[11px] text-prime-muted">Vazio = prazo do cadastro do cliente. Define também quando o motorista recebe.</span>
        </label>
        <button type="button" disabled={busy} onClick={() => void generate()} className="btn-primary disabled:opacity-50">
          {busy ? "Processando…" : "Fechar e gerar fatura"}
        </button>
      </div>

      {msg ? <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}

      {(() => {
        const visible = rows.filter((r) => inCompany(company, r.billing_issuer));
        const active = visible.filter((r) => r.status !== "cancelada");
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
        const open = active.filter((r) => r.status === "aberta" || r.status === "enviada");
        const late = open.filter((r) => r.due_date < today);
        const toSend = active.filter((r) => r.status === "aberta");
        const paidMonth = active.filter((r) => r.status === "paga" && (r.paid_at ?? "").slice(0, 7) === today.slice(0, 7));
        const sum = (l: Row[]) => l.reduce((s, r) => s + Number(r.total_amount || 0), 0);
        const drivers = open.flatMap((r) => r.payouts ?? []).filter((p) => p.status === "open");
        const kpis = [
          { label: "A receber (projeção)", value: brl(sum(open)), sub: `${open.length} fatura(s) em aberto`, dark: true },
          { label: "Vencidas", value: brl(sum(late)), sub: late.length ? `${late.length} fatura(s) — cobrar` : "nenhuma", warn: late.length > 0 },
          { label: "Falta enviar ao cliente", value: String(toSend.length), sub: toSend.length ? brl(sum(toSend)) : "tudo enviado" },
          { label: "A repassar aos motoristas", value: brl(drivers.reduce((s, p) => s + p.amount, 0)), sub: "dessas faturas" },
          { label: "Recebido no mês", value: brl(sum(paidMonth)), sub: `${paidMonth.length} fatura(s)` }
        ];
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {kpis.map((k) => (
                <div
                  key={k.label}
                  className={`rounded-2xl p-4 shadow-prime-card ${k.dark ? "bg-[linear-gradient(135deg,#111_0%,#2a2418_100%)] text-[#fff]" : "border border-prime-border bg-white"}`}
                >
                  <p className={`text-xs ${k.dark ? "text-[#C8C3B8]" : "text-prime-muted"}`}>{k.label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${k.warn ? "text-red-700" : ""}`}>{k.value}</p>
                  <p className={`mt-1 text-xs ${k.dark ? "text-[#C9A84C]" : "text-prime-muted"}`}>{k.sub}</p>
                </div>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="rounded-2xl border border-prime-border bg-white p-6 text-sm text-prime-muted">Nenhuma fatura ainda.</p>
            ) : (
              <div className="grid gap-3">
                {visible.map((r) => {
                  const isLate = (r.status === "aberta" || r.status === "enviada") && r.due_date < today;
                  const badge =
                    r.status === "paga"
                      ? "bg-emerald-50 text-emerald-800"
                      : r.status === "cancelada"
                        ? "bg-prime-bg text-prime-muted"
                        : isLate
                          ? "bg-red-50 text-red-800"
                          : r.status === "enviada"
                            ? "bg-sky-50 text-sky-800"
                            : "bg-amber-50 text-amber-900";
                  const badgeText = isLate ? "Vencida" : r.status === "aberta" ? "Falta enviar" : INVOICE_STATUS_LABEL[r.status];
                  const live = r.status !== "cancelada" && r.status !== "paga";
                  const action = "rounded-lg px-3 py-1.5 text-sm ring-1 ring-prime-border hover:ring-prime-gold disabled:opacity-50";
                  return (
                    <article key={r.id} className={`rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card ${r.status === "cancelada" ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-prime-muted">
                            {formatInvoiceNumber(r.number)}
                            {r.client_ref ? ` · ${r.client_ref}` : ""} · {brDate(r.period_start)}
                            {r.period_end !== r.period_start ? ` a ${brDate(r.period_end)}` : ""}
                          </p>
                          <h3 className="text-base font-semibold">{r.client_name ?? "—"}</h3>
                          <p className="text-xs text-prime-muted">
                            {r.trip_count} corrida{r.trip_count > 1 ? "s" : ""}
                            {r.sent_at ? ` · enviada em ${new Date(r.sent_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                            {r.paid_at ? ` · paga em ${new Date(r.paid_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                          </p>
                        </div>
                        <div className="flex items-start gap-4 text-right">
                          <div>
                            <p className="text-xs text-prime-muted">Vence</p>
                            {editDue?.id === r.id ? (
                              <span className="flex items-center gap-1">
                                <input type="date" value={editDue.value} onChange={(e) => setEditDue({ id: r.id, value: e.target.value })} className="rounded-md border px-1 py-1 text-sm" />
                                <button
                                  type="button"
                                  className="text-sm font-semibold text-emerald-700"
                                  onClick={() => {
                                    const v = editDue.value;
                                    setEditDue(null);
                                    if (v && v !== r.due_date) void patch(r.id, { due_date: v }, "Vencimento alterado. Contas a receber e carteira dos motoristas atualizadas.");
                                  }}
                                >
                                  OK
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                title="Alterar vencimento"
                                disabled={!live}
                                onClick={() => setEditDue({ id: r.id, value: r.due_date })}
                                className={`font-semibold underline decoration-dotted disabled:no-underline ${isLate ? "text-red-700" : ""}`}
                              >
                                {brDate(r.due_date)}
                              </button>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-prime-muted">Total</p>
                            <p className="text-lg font-bold">{brl(r.total_amount)}</p>
                          </div>
                          <span className={`self-center rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>{badgeText}</span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 rounded-xl bg-prime-bg/60 p-3 text-sm sm:grid-cols-3">
                        <p>
                          <span className="block text-xs text-prime-muted">Boleto</span>
                          {r.boleto_path ? (
                            <a href={`/api/client-invoices/${r.id}/files?kind=boleto`} target="_blank" rel="noopener noreferrer" className="font-medium text-prime-gold-ink hover:underline">
                              📄 Ver boleto
                            </a>
                          ) : r.boleto_url || r.boleto_line ? (
                            "Linha digitável cadastrada"
                          ) : (
                            <span className="text-amber-800">Falta anexar</span>
                          )}
                        </p>
                        <p>
                          <span className="block text-xs text-prime-muted">Nota fiscal</span>
                          {r.nf_path ? (
                            <a href={`/api/client-invoices/${r.id}/files?kind=nf`} target="_blank" rel="noopener noreferrer" className="font-medium text-prime-gold-ink hover:underline">
                              NF {r.nf_number ?? ""}
                            </a>
                          ) : r.nf_number ? (
                            `NF ${r.nf_number}`
                          ) : (
                            <span className="text-prime-muted">Sem nota</span>
                          )}
                        </p>
                        <div>
                          <span className="block text-xs text-prime-muted">Motoristas recebem</span>
                          {r.payouts?.length ? (
                            r.payouts.map((p, i) => (
                              <p key={i}>
                                <b>{p.driver.split(" ")[0]}</b> {brl(p.amount)} {p.status === "paid" ? "· pago" : p.due_date ? `em ${brDate(p.due_date)}` : ""}
                              </p>
                            ))
                          ) : (
                            <span className="text-prime-muted">Sem repasse (funcionário ou frota)</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <a href={`/fatura/${r.id}`} target="_blank" rel="noopener noreferrer" className={action}>
                          Abrir fatura
                        </a>
                        {r.voucher_path ? (
                          <a href={`/api/client-invoices/${r.id}/files?kind=voucher`} target="_blank" rel="noopener noreferrer" className={action}>
                            🧾 Voucher
                          </a>
                        ) : null}
                        {live ? (
                          <>
                            <button type="button" disabled={busy} onClick={() => pickFile(r, "boleto")} className={action}>
                              {r.boleto_path ? "Trocar boleto" : "⬆ Anexar boleto"}
                            </button>
                            <button type="button" disabled={busy} onClick={() => pickFile(r, "nf")} className={action}>
                              {r.nf_path ? "Trocar nota" : "⬆ Anexar nota"}
                            </button>
                            {r.status === "aberta" ? (
                              <>
                                <button type="button" disabled={busy} onClick={() => void send(r.id)} className={action}>
                                  ✉ Enviar por e-mail
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void patch(r.id, { status: "enviada" }, "Fatura marcada como enviada ao cliente.")}
                                  className="rounded-lg bg-[#111] px-3 py-1.5 text-sm font-semibold text-[#C9A84C] disabled:opacity-50"
                                >
                                  ✓ Já enviei ao cliente
                                </button>
                              </>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => void send(r.id)} className={action}>
                                ✉ Reenviar
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => window.confirm("Confirmar que o cliente pagou esta fatura?") && void patch(r.id, { status: "paga" }, "Fatura marcada como paga. Repasses aos parceiros liberados.")}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-[#fff] disabled:opacity-50"
                            >
                              $ Recebido
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => window.confirm("Cancelar esta fatura? As corridas voltam a ficar sem fatura.") && void patch(r.id, { status: "cancelada" }, "Fatura cancelada.")}
                              className="rounded-lg px-3 py-1.5 text-sm text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}
    </section>
  );
}
