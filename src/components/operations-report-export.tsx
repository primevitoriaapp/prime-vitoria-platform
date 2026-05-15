"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Props = {
  devFallbackRole?: "admin" | "operador" | "financeiro";
};

export function OperationsReportExport({ devFallbackRole = "admin" }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reportQuery(format: "csv" | "html") {
    const qs = new URLSearchParams({ format, page: "1", pageSize: "500" });
    if (from) qs.set("scheduledFrom", new Date(from).toISOString());
    if (to) qs.set("scheduledTo", new Date(to).toISOString());
    return qs;
  }

  async function downloadCsv() {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/reports/operations/trips?${reportQuery("csv")}`,
      {},
      devFallbackRole
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setMessage(json.error?.message ?? "Falha ao exportar.");
      setLoading(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operacoes-viagens.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("CSV descarregado.");
    setLoading(false);
  }

  async function openPrintHtml() {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/reports/operations/trips?${reportQuery("html")}`,
      {},
      devFallbackRole
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setMessage(json.error?.message ?? "Falha ao gerar relatório.");
      setLoading(false);
      return;
    }
    const html = await res.text();
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      setMessage("Permita pop-ups para abrir o relatório.");
      setLoading(false);
      return;
    }
    w.document.write(html);
    w.document.close();
    setMessage("Relatório aberto — use Imprimir / Guardar como PDF no browser.");
    setLoading(false);
  }

  return (
    <section className="card mt-6">
      <h2 className="text-lg font-semibold text-slate-900">Exportar relatório operacional</h2>
      <p className="mt-1 text-sm text-slate-600">Viagens do tenant (até 500 linhas) em CSV ou HTML para impressão/PDF.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          De
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Até
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void downloadCsv()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? "A gerar…" : "Descarregar CSV"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void openPrintHtml()}
          className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
        >
          Imprimir / PDF
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
