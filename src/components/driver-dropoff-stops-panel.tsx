"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { buildNavigationLinksToPoint } from "@/lib/trips/driver-nav-links";
import { nextPendingDropoffIndex, parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";
import { suggestOrder } from "@/lib/trips/stop-order";

/** Durante a viagem: uma parada por passageiro, com rota e "Desceu ✓". O motorista pode trocar a ordem. */
export function DriverDropoffStopsPanel({
  tripId,
  raw,
  active,
  start,
  devFallbackRole,
  onChanged
}: {
  tripId: string;
  raw: unknown;
  /** Ponto de partida (embarque), para sugerir a ordem mais curta. */
  start?: { lat: number | null; lng: number | null };
  /** Só deixa marcar com a viagem em andamento. */
  active: boolean;
  devFallbackRole: "motorista" | "admin";
  onChanged: () => void;
}) {
  const stops = parseDropoffStops(raw);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  if (!stops.length) return null;
  const next = nextPendingDropoffIndex(stops);
  const done = stops.filter((s) => s.dropped_at).length;
  const pendingIdx = stops.map((s, i) => (s.dropped_at ? -1 : i)).filter((i) => i >= 0);
  // Saída: última parada já feita ou o embarque.
  const lastDone = [...stops].reverse().find((s) => s.dropped_at);
  const from = lastDone?.lat != null ? { lat: lastDone.lat, lng: lastDone.lng } : (start ?? { lat: null, lng: null });
  const suggestion = pendingIdx.length >= 2 ? suggestOrder(from, stops) : null;
  const better = suggestion && suggestion.order.join() !== pendingIdx.join() && suggestion.currentKm - suggestion.km >= 0.5 ? suggestion : null;

  async function reorder(order: number[], suggested = false) {
    setBusy(-1);
    setErr(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/dropoff-reorder`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order, suggested }) },
      devFallbackRole
    ).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    setBusy(null);
    if (!res?.ok || !j.success) {
      setErr(j.error?.message ?? "Não foi possível trocar a ordem.");
      return;
    }
    setShowSuggestion(false);
    onChanged();
  }
  function move(i: number, dir: -1 | 1) {
    const pos = pendingIdx.indexOf(i);
    const to = pos + dir;
    if (pos < 0 || to < 0 || to >= pendingIdx.length) return;
    const order = [...pendingIdx];
    [order[pos], order[to]] = [order[to], order[pos]];
    void reorder(order);
  }
  const firstName = (i: number) => stops[i]?.passenger_name?.split(" ")[0] || `Parada ${i + 1}`;

  async function drop(index: number) {
    setBusy(index);
    setErr(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/dropoff-complete`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index }) },
      devFallbackRole
    );
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(null);
    if (!res.ok || !j.success) {
      setErr(j.error?.message ?? "Não foi possível marcar. Tente de novo.");
      return;
    }
    onChanged();
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8A6A1F]">
        Passageiros a bordo · {done}/{stops.length} desembarcados
      </p>
      <p className="mt-1 text-xs text-[#6B6F76]">Ordem do cliente. Use ↑ ↓ para trocar — a central é avisada.</p>
      {better ? (
        showSuggestion ? (
          <div className="mt-3 rounded-2xl bg-[#EEF6FF] p-3 text-sm">
            <p className="font-semibold text-[#0B3B66]">Sugestão de ordem mais curta (≈ {(better.currentKm - better.km).toFixed(1)} km a menos):</p>
            <p className="mt-1 text-[#0B3B66]">{better.order.map(firstName).join(" → ")}</p>
            <p className="mt-1 text-xs text-[#4A6A8A]">Cálculo aproximado. Se o cliente pediu uma ordem, mantenha a dele.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy !== null} onClick={() => setShowSuggestion(false)} className="rounded-xl border border-[#BFD6EE] bg-white py-2 font-semibold">
                Manter
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void reorder(better.order, true)} className="rounded-xl bg-[#0B3B66] py-2 font-bold text-[#fff]">
                Usar esta ordem
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowSuggestion(true)} className="mt-3 w-full rounded-xl border border-[#BFD6EE] bg-[#EEF6FF] py-2 text-sm font-semibold text-[#0B3B66]">
            🧭 Ver sugestão de ordem mais curta
          </button>
        )
      ) : null}
      <ol className="mt-3 space-y-2">
        {stops.map((s, i) => {
          const isNext = i === next;
          const nav = buildNavigationLinksToPoint({ lat: s.lat ?? null, lng: s.lng ?? null, label: s.address_text });
          const waze = nav.find((n) => n.id === "waze") ?? nav[0];
          return (
            <li
              key={`${s.passenger_name}-${i}`}
              className={`overflow-hidden rounded-2xl border ${s.dropped_at ? "border-emerald-200 bg-emerald-50 p-3" : isNext ? "border-2 border-[#C9A84C] bg-[#FBF6EA] shadow-[0_6px_18px_rgba(201,168,76,0.25)]" : "border-[#ECE7DB] p-3"}`}
            >
              {isNext ? <p className="bg-[#111] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#C9A84C]">➜ Próximo desembarque</p> : null}
              <div className={isNext ? "p-3" : ""}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#111]">
                    {s.final ? "🏁 " : `${i + 1}. `}
                    {s.passenger_name || (s.final ? "Destino final" : "Parada")}
                    {s.final && s.passenger_name ? <span className="ml-1 text-xs font-normal text-[#6B6F76]">(destino final)</span> : null}
                    {s.dropped_at ? <span className="ml-2 text-xs font-semibold text-emerald-700">✓ desceu</span> : null}
                  </span>
                  <span className="block text-xs text-[#6B6F76]">{s.address_text}</span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {!s.dropped_at && pendingIdx.length > 1 ? (
                    <>
                      <button type="button" aria-label="Levar antes" disabled={busy !== null || pendingIdx.indexOf(i) === 0} onClick={() => move(i, -1)} className="h-8 w-8 rounded-xl border border-[#ECE7DB] text-sm disabled:opacity-25">
                        ↑
                      </button>
                      <button type="button" aria-label="Levar depois" disabled={busy !== null || pendingIdx.indexOf(i) === pendingIdx.length - 1} onClick={() => move(i, 1)} className="h-8 w-8 rounded-xl border border-[#ECE7DB] text-sm disabled:opacity-25">
                        ↓
                      </button>
                    </>
                  ) : null}
                  {!s.dropped_at && s.passenger_phone ? (
                    <a href={`tel:${s.passenger_phone.replace(/[^\d+]/g, "")}`} className="rounded-xl border border-[#ECE7DB] px-3 py-1.5 text-xs font-semibold">
                      📞 Ligar
                    </a>
                  ) : null}
                  {!s.dropped_at && waze ? (
                    <a href={waze.href} target={waze.id === "waze" ? undefined : "_blank"} rel="noopener noreferrer" className="rounded-xl border border-[#ECE7DB] px-3 py-1.5 text-xs font-semibold">
                      🧭 Rota
                    </a>
                  ) : null}
                </span>
              </div>
              {!s.dropped_at && active ? (
                <button
                  type="button"
                  onClick={() => void drop(i)}
                  disabled={busy !== null}
                  className={`mt-2 w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 ${isNext ? "bg-[#111] text-[#C9A84C]" : "border border-[#ECE7DB] text-[#111]"}`}
                >
                  {busy === i ? "Salvando…" : s.passenger_name ? `${s.passenger_name.split(" ")[0]} desceu ✓` : `Parada ${i + 1} feita ✓`}
                </button>
              ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </section>
  );
}
