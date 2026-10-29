"use client";

import { useEffect, useState } from "react";

type Props = { tripId: string };

const toText = (n: unknown) => (n == null || n === "" ? "" : Number(n).toFixed(2).replace(".", ","));
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Agenda → valores da corrida: quanto o cliente paga e quanto o motorista recebe (aparece no app dele). */
export function TripAmountsEditor({ tripId }: Props) {
  const [client, setClient] = useState("");
  const [driver, setDriver] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/trips/${tripId}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { data?: { client_amount?: number | null; driver_amount?: number | null } };
      setClient(toText(json.data?.client_amount));
      setDriver(toText(json.data?.driver_amount));
    })();
  }, [tripId]);

  const c = Number(client.replace(/\./g, "").replace(",", "."));
  const d = Number(driver.replace(/\./g, "").replace(",", "."));
  const margin = client && driver && Number.isFinite(c) && Number.isFinite(d) ? c - d : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/trips/${tripId}/amounts`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_amount: client.trim() || null, driver_amount: driver.trim() || null })
    });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Valores salvos. O motorista já vê o valor dele no app." } : { ok: false, text: "Não foi possível salvar." });
  }

  const field = "w-full rounded-lg border border-prime-input-border px-3 py-2 text-base";
  return (
    <section className="rounded-xl border border-prime-gold/50 bg-white p-4 shadow-prime-card">
      <h3 className="text-sm font-semibold uppercase tracking-wide">Valores desta corrida</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Cliente paga (R$)
          <input inputMode="decimal" className={field} value={client} onChange={(e) => setClient(e.target.value)} placeholder="ex.: 250,00" />
        </label>
        <label className="grid gap-1 text-sm">
          Motorista recebe (R$)
          <input inputMode="decimal" className={field} value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="ex.: 100,00" />
        </label>
        <div className="grid gap-1 text-sm">
          Margem da Prime
          <span className={`rounded-lg bg-prime-bg px-3 py-2 text-base font-semibold ${margin != null && margin < 0 ? "text-red-700" : ""}`}>
            {margin == null ? "—" : brl(margin)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs text-prime-muted">
        Vazio = usa a tabela da empresa ao concluir. Motorista funcionário não vê valores; parceiro vê o que vai receber.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar valores"}
        </button>
        {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span> : null}
      </div>
    </section>
  );
}
