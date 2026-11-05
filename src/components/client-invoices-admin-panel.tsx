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
    <section className="card mb-6 space-y-4">
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

      <div className="grid gap-3 rounded-xl border border-prime-gold/40 bg-[#FBF8F1] p-3 md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
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

      <VouchersToCloseCard onClosed={() => void load()} />

      {msg ? <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}

      {rows.length === 0 ? (
        <p className="text-sm text-prime-muted">Nenhuma fatura ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-prime-muted">
                <th className="py-2">Fatura</th>
                <th>Cliente</th>
                <th>Período</th>
                <th>Vence</th>
                <th className="text-right">Corridas</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => inCompany(company, r.billing_issuer)).map((r) => (
                <tr key={r.id} className={`border-t border-prime-border ${r.status === "cancelada" ? "opacity-50" : ""}`}>
                  <td className="py-2 font-medium">
                    {formatInvoiceNumber(r.number)}
                    {r.client_ref ? <span className="block text-xs font-normal text-prime-muted">{r.client_ref}</span> : null}
                  </td>
                  <td>{r.client_name ?? "—"}</td>
                  <td>
                    {brDate(r.period_start)} – {brDate(r.period_end)}
                  </td>
                  <td>
                    {editDue?.id === r.id ? (
                      <span className="flex items-center gap-1">
                        <input type="date" value={editDue.value} onChange={(e) => setEditDue({ id: r.id, value: e.target.value })} className="rounded-md border px-1 py-1 text-xs" />
                        <button
                          type="button"
                          className="text-xs font-semibold text-emerald-700"
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
                        disabled={r.status === "paga" || r.status === "cancelada"}
                        onClick={() => setEditDue({ id: r.id, value: r.due_date })}
                        className="underline decoration-dotted disabled:no-underline"
                      >
                        {brDate(r.due_date)}
                      </button>
                    )}
                  </td>
                  <td className="text-right">{r.trip_count}</td>
                  <td className="text-right font-semibold">{brl(r.total_amount)}</td>
                  <td>
                    {INVOICE_STATUS_LABEL[r.status]}
                    {r.boleto_path ? (
                      <>
                        {" · "}
                        <a href={`/api/client-invoices/${r.id}/files?kind=boleto`} target="_blank" rel="noopener noreferrer" className="text-prime-gold-ink hover:underline">
                          boleto
                        </a>
                      </>
                    ) : r.boleto_url || r.boleto_line ? (
                      " · boleto"
                    ) : (
                      <span className="text-amber-700"> · sem boleto</span>
                    )}
                    {r.nf_path ? (
                      <>
                        {" · "}
                        <a href={`/api/client-invoices/${r.id}/files?kind=nf`} target="_blank" rel="noopener noreferrer" className="text-prime-gold-ink hover:underline">
                          NF{r.nf_number ? ` ${r.nf_number}` : ""}
                        </a>
                      </>
                    ) : r.nf_number ? (
                      ` · NF ${r.nf_number}`
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right text-xs">
                    <a href={`/fatura/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-prime-gold-ink hover:underline">
                      Abrir
                    </a>
                    {r.status !== "cancelada" && r.status !== "paga" ? (
                      <>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => pickFile(r, "boleto")} className="text-prime-gold-ink hover:underline">
                          {r.boleto_path ? "Trocar boleto" : "Anexar boleto"}
                        </button>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => pickFile(r, "nf")} className="text-prime-gold-ink hover:underline">
                          {r.nf_path ? "Trocar nota" : "Anexar nota"}
                        </button>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => void send(r.id)} className="text-prime-gold-ink hover:underline">
                          Enviar
                        </button>
                        {" · "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => window.confirm("Confirmar que o cliente pagou esta fatura?") && void patch(r.id, { status: "paga" }, "Fatura marcada como paga. Repasses aos parceiros liberados.")}
                          className="text-emerald-700 hover:underline"
                        >
                          Paga
                        </button>
                        {" · "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => window.confirm("Cancelar esta fatura? As corridas voltam a ficar sem fatura.") && void patch(r.id, { status: "cancelada" }, "Fatura cancelada.")}
                          className="text-red-700 hover:underline"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
