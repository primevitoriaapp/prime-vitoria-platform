"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Data = {
  status: string;
  service_mode: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  odometer_km: number | null;
  gps_km: number | null;
  gps_gaps: number;
  gps_points: number;
  billed_km: number | null;
  km_source: string | null;
  client_amount: number | null;
  driver_amount: number | null;
  review_required: boolean;
  review_reason: string | null;
  reviewed_at: string | null;
  locked: string | null;
};

const km = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const SOURCE: Record<string, string> = { odometer: "painel do motorista", gps_trail: "GPS", manual: "digitado pela central", coords: "estimativa do mapa" };

/** Conferência do KM no fim da corrida: painel do motorista × GPS, escolher qual cobra e corrigir se precisar. */
export function TripKmReviewCard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [choice, setChoice] = useState<"odometer" | "gps" | "manual">("odometer");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/km-review`, {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Data };
    if (j.success && j.data) {
      setD(j.data);
      setStart(j.data.odometer_start != null ? String(j.data.odometer_start) : "");
      setEnd(j.data.odometer_end != null ? String(j.data.odometer_end) : "");
      setChoice(j.data.odometer_km != null || j.data.gps_km == null ? "odometer" : "gps");
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!d) return null;
  const relevant = d.status === "completed" || d.odometer_start != null;
  if (!relevant) return null;

  const s = Number(start.replace(/\./g, "").replace(",", "."));
  const e = Number(end.replace(/\./g, "").replace(",", "."));
  const previewOdo = Number.isFinite(s) && Number.isFinite(e) && e > s ? Math.round((e - s) * 10) / 10 : null;
  const newKm = choice === "odometer" ? previewOdo : choice === "gps" ? d.gps_km : Number(manual.replace(",", ".")) || null;
  const diffBig = d.odometer_km != null && d.gps_km != null && Math.abs(d.odometer_km - d.gps_km) > 3 && Math.abs(d.odometer_km - d.gps_km) > d.gps_km * 0.2;

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/km-review`,
      {
        method: "POST",
        body: JSON.stringify({
          choice,
          ...(choice === "odometer" ? { odometer_start: start, odometer_end: end } : {}),
          ...(choice === "manual" ? { km: Number(manual.replace(",", ".")) } : {})
        })
      },
      "admin"
    );
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { km: number; client_amount: number | null; driver_amount: number | null }; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível salvar." });
    setMsg({
      ok: true,
      text: `KM confirmado: ${km(j.data.km)}. Cliente ${brl(Number(j.data.client_amount))} · motorista ${brl(Number(j.data.driver_amount))}. Conta a receber e repasse atualizados.`
    });
    await load();
    router.refresh();
  }

  return (
    <section className={`rounded-2xl border-2 bg-white p-4 shadow-prime-card ${d.reviewed_at ? "border-emerald-300" : "border-prime-gold"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Conferência do KM</h3>
        {d.reviewed_at ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            ✓ Conferido em {new Date(d.reviewed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : d.status === "completed" ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Falta conferir</span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-prime-bg p-3">
          <p className="text-xs text-prime-muted">Painel do motorista</p>
          <p className="text-lg font-semibold">{km(d.odometer_km)}</p>
          <p className="text-xs text-prime-muted">
            {d.odometer_start != null ? d.odometer_start.toLocaleString("pt-BR") : "—"} → {d.odometer_end != null ? d.odometer_end.toLocaleString("pt-BR") : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-prime-bg p-3">
          <p className="text-xs text-prime-muted">GPS do app</p>
          <p className="text-lg font-semibold">{km(d.gps_km)}</p>
          <p className="text-xs text-prime-muted">{d.gps_points ? `${d.gps_points} pontos${d.gps_gaps ? ` · ${d.gps_gaps} falhas de sinal` : ""}` : "sem rastro"}</p>
        </div>
        <div className="rounded-xl bg-[#111] p-3 text-[#fff]">
          <p className="text-xs text-[#C8C3B8]">KM cobrado hoje</p>
          <p className="text-lg font-semibold">{km(d.billed_km)}</p>
          <p className="text-xs text-[#C9A84C]">{d.km_source ? SOURCE[d.km_source] ?? d.km_source : "—"}</p>
        </div>
        <div className="rounded-xl bg-prime-bg p-3">
          <p className="text-xs text-prime-muted">Valores</p>
          <p className="text-sm font-semibold">Cliente {brl(d.client_amount)}</p>
          <p className="text-sm">Motorista {brl(d.driver_amount)}</p>
        </div>
      </div>

      {diffBig ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          Painel e GPS estão bem diferentes. A regra hoje é cobrar pelo <b>painel do motorista</b>; confira se o KM final foi digitado certo.
        </p>
      ) : null}

      {d.locked ? (
        <p className="mt-3 rounded-lg bg-prime-bg p-2 text-sm text-prime-muted">{d.locked}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="text-sm font-semibold">Qual KM vale para cobrar?</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["odometer", "KM do motorista (painel) — padrão"],
                ["gps", "KM do GPS"],
                ["manual", "Digitar outro KM"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === "gps" && !d.gps_km}
                onClick={() => setChoice(id)}
                className={`rounded-lg px-3 py-2 text-sm ring-1 disabled:opacity-40 ${choice === id ? "bg-[#111] text-[#fff] ring-[#111]" : "ring-prime-border"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {choice === "odometer" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span>KM inicial (painel)</span>
                <input className={PRIME_INPUT_CLASS} inputMode="decimal" value={start} onChange={(ev) => setStart(ev.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>KM final (painel)</span>
                <input className={PRIME_INPUT_CLASS} inputMode="decimal" value={end} onChange={(ev) => setEnd(ev.target.value)} />
              </label>
              <p className="self-end pb-2 text-sm">
                Rodou: <b>{km(previewOdo)}</b>
              </p>
            </div>
          ) : null}
          {choice === "manual" ? (
            <label className="grid max-w-xs gap-1 text-sm">
              <span>KM a cobrar</span>
              <input className={PRIME_INPUT_CLASS} inputMode="decimal" value={manual} onChange={(ev) => setManual(ev.target.value)} placeholder="Ex.: 25" />
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || !newKm} onClick={() => void save()} className="rounded-lg bg-prime-gold px-4 py-2 text-sm font-bold text-[#111] disabled:opacity-50">
              {busy ? "Salvando…" : `Confirmar ${newKm ? km(newKm) : "KM"} e recalcular valores`}
            </button>
            <span className="text-xs text-prime-muted">Recalcula cliente e motorista pela tabela (km mínimo incluso). Valor fechado digitado na corrida não muda.</span>
          </div>
        </div>
      )}
      {msg ? <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
