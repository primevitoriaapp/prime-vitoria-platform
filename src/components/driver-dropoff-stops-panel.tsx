"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { buildNavigationLinksToPoint } from "@/lib/trips/driver-nav-links";
import { nextPendingDropoffIndex, parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";

/** Durante a viagem: uma parada por passageiro, com rota e "Desceu ✓". */
export function DriverDropoffStopsPanel({
  tripId,
  raw,
  active,
  devFallbackRole,
  onChanged
}: {
  tripId: string;
  raw: unknown;
  /** Só deixa marcar com a viagem em andamento. */
  active: boolean;
  devFallbackRole: "motorista" | "admin";
  onChanged: () => void;
}) {
  const stops = parseDropoffStops(raw);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!stops.length) return null;
  const next = nextPendingDropoffIndex(stops);
  const done = stops.filter((s) => s.dropped_at).length;

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
      <ol className="mt-3 space-y-2">
        {stops.map((s, i) => {
          const isNext = i === next;
          const nav = buildNavigationLinksToPoint({ lat: s.lat ?? null, lng: s.lng ?? null, label: s.address_text });
          const waze = nav.find((n) => n.id === "waze") ?? nav[0];
          return (
            <li
              key={`${s.passenger_name}-${i}`}
              className={`rounded-2xl border p-3 ${s.dropped_at ? "border-emerald-200 bg-emerald-50" : isNext ? "border-[#C9A84C] bg-[#FBF6EA]" : "border-[#ECE7DB]"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#111]">
                    {i + 1}. {s.passenger_name}
                    {s.dropped_at ? <span className="ml-2 text-xs font-semibold text-emerald-700">✓ desceu</span> : null}
                  </span>
                  <span className="block text-xs text-[#6B6F76]">{s.address_text}</span>
                </span>
                {!s.dropped_at && waze ? (
                  <a href={waze.href} target={waze.id === "waze" ? undefined : "_blank"} rel="noopener noreferrer" className="shrink-0 rounded-xl border border-[#ECE7DB] px-3 py-1.5 text-xs font-semibold">
                    🧭 Rota
                  </a>
                ) : null}
              </div>
              {!s.dropped_at && active ? (
                <button
                  type="button"
                  onClick={() => void drop(i)}
                  disabled={busy !== null}
                  className={`mt-2 w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 ${isNext ? "bg-[#111] text-[#C9A84C]" : "border border-[#ECE7DB] text-[#111]"}`}
                >
                  {busy === i ? "Salvando…" : `${s.passenger_name.split(" ")[0]} desceu ✓`}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </section>
  );
}
