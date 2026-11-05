"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import type { ProgressStep } from "@/lib/trips/trip-progress";

const KEYS = [
  ["caminho", "Iniciou o deslocamento"],
  ["local", "Chegou ao local"],
  ["iniciada", "Iniciou a corrida (passageiro a bordo)"],
  ["finalizada", "Finalizou a corrida"]
] as const;

/** ISO → "2026-11-05T17:30" no horário de Brasília (sem horário de verão). */
function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
const fromLocal = (v: string) => (v ? `${v}:00-03:00` : null);

/** Central corrige horários e KM da linha do tempo que o cliente vê (enquanto o app ainda falha às vezes). */
export function TripTimelineEditor({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [km, setKm] = useState("");
  const [origKm, setOrigKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/progress`, {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { steps: ProgressStep[]; km?: number | null } };
    if (!j.success || !j.data) return;
    setSteps(j.data.steps);
    const f: Record<string, string> = {};
    for (const [k] of KEYS) f[k] = toLocal(j.data.steps.find((s) => s.key === k)?.at);
    setForm(f);
    setOrig(f);
    const k = j.data.km != null ? String(j.data.km).replace(".", ",") : "";
    setKm(k);
    setOrigKm(k);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const changed = Object.fromEntries(KEYS.filter(([k]) => form[k] !== orig[k]).map(([k]) => [k, fromLocal(form[k])]));
      if (Object.keys(changed).length) {
        const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/progress`, { method: "PATCH", body: JSON.stringify({ overrides: changed }) }, "admin");
        if (!r.ok) throw new Error("Não foi possível salvar os horários.");
      }
      if (km.trim() && km !== origKm) {
        const n = Number(km.replace(/\./g, "").replace(",", "."));
        if (!(n > 0)) throw new Error("KM inválido.");
        const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/km-review`, { method: "POST", body: JSON.stringify({ choice: "manual", km: n }) }, "admin");
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
        if (!r.ok || !j.success) throw new Error(j.error?.message ?? "Não foi possível salvar o KM.");
        window.dispatchEvent(new CustomEvent("trip-amounts-changed", { detail: tripId }));
      }
      window.dispatchEvent(new CustomEvent("trip-timeline-changed", { detail: tripId }));
      setMsg({ ok: true, text: "Salvo. O cliente já vê os horários e o KM corrigidos." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    setBusy(true);
    await fetchWithSupabaseSession(
      `/api/trips/${tripId}/progress`,
      { method: "PATCH", body: JSON.stringify({ overrides: Object.fromEntries(KEYS.map(([k]) => [k, null])) }) },
      "admin"
    );
    setBusy(false);
    window.dispatchEvent(new CustomEvent("trip-timeline-changed", { detail: tripId }));
    setMsg({ ok: true, text: "Voltou aos horários registrados pelo app." });
    await load();
  }

  const edited = steps.some((s) => s.edited);
  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Corrigir horários e KM (o que o cliente vê)</p>
          <p className="text-xs text-prime-muted">Use quando o app do motorista não registrou certo. O cliente não vê que houve ajuste.</p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-prime-gold">
          {open ? "Fechar" : "✎ Editar"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {KEYS.map(([k, label]) => (
              <label key={k} className="grid gap-1 text-sm">
                <span>{label}</span>
                <input type="datetime-local" className={PRIME_INPUT_CLASS} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
            <label className="grid gap-1 text-sm">
              <span>KM rodado</span>
              <input className={PRIME_INPUT_CLASS} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ex.: 34" />
              <span className="text-[11px] text-prime-muted">Mudar o KM recalcula cliente e motorista pela tabela (corrida por km).</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C] disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {edited ? (
              <button type="button" disabled={busy} onClick={() => void resetAll()} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
                Voltar aos horários do app
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
