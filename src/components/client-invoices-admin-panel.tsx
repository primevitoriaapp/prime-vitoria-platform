"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { INVOICE_STATUS_LABEL, formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

type Row = {
  id: string;
  number: number;
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
  const [month, setMonth] = useState(prevMonth);
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
    setBusy(true);
    setMsg(null);
    const res = await fetchWithSupabaseSession(
      "/api/client-invoices/generate",
      { method: "POST", body: JSON.stringify({ period_start: `${month}-01`, period_end: `${month}-${String(last).padStart(2, "0")}` }) },
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
            As empresas com fechamento automático (cadastro do cliente) têm a fatura criada sozinha no dia seguinte ao fechamento. Use o botão para fechar um mês manualmente. O vencimento segue o prazo do cadastro.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="grid gap-1 text-xs">
            Mês
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={() => void generate()} className="btn-primary disabled:opacity-50">
            {busy ? "Processando…" : "Fechar mês e gerar faturas"}
          </button>
        </div>
      </div>

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
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-prime-border ${r.status === "cancelada" ? "opacity-50" : ""}`}>
                  <td className="py-2 font-medium">{formatInvoiceNumber(r.number)}</td>
                  <td>{r.client_name ?? "—"}</td>
                  <td>
                    {brDate(r.period_start)} – {brDate(r.period_end)}
                  </td>
                  <td>{brDate(r.due_date)}</td>
                  <td className="text-right">{r.trip_count}</td>
                  <td className="text-right font-semibold">{brl(r.total_amount)}</td>
                  <td>
                    {INVOICE_STATUS_LABEL[r.status]}
                    {r.boleto_path ? (
                      <>
                        {" · "}
                        <a href={`/api/client-invoices/${r.id}/files?kind=boleto`} target="_blank" rel="noopener noreferrer" className="text-prime-gold hover:underline">
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
                        <a href={`/api/client-invoices/${r.id}/files?kind=nf`} target="_blank" rel="noopener noreferrer" className="text-prime-gold hover:underline">
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
                    <a href={`/fatura/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-prime-gold hover:underline">
                      Abrir
                    </a>
                    {r.status !== "cancelada" && r.status !== "paga" ? (
                      <>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => pickFile(r, "boleto")} className="text-prime-gold hover:underline">
                          {r.boleto_path ? "Trocar boleto" : "Anexar boleto"}
                        </button>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => pickFile(r, "nf")} className="text-prime-gold hover:underline">
                          {r.nf_path ? "Trocar nota" : "Anexar nota"}
                        </button>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => void send(r.id)} className="text-prime-gold hover:underline">
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
