"use client";

import { useCallback, useEffect, useState } from "react";

export type DriverSummary = {
  today: string;
  done_today: number;
  months: Record<string, { trips: number; km: number }>;
  rating: number | null;
  ratings_count: number;
  month_rating: Record<string, number>;
  ratings_by_trip: Record<string, { stars: number; comment: string | null }>;
  since: string | null;
  central_phone: string | null;
};

type Msg = { id: string; title: string; body: string; created_at: string; live: boolean; read_at: string | null };

/** Resumo do motorista (feitas hoje, mês, nota). Null no modo prévia da central. */
export function useDriverSummary(enabled: boolean) {
  const [s, setS] = useState<DriverSummary | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    void fetch("/api/drivers/me/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: DriverSummary }) => j.success && j.data && setS(j.data))
      .catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);
  return s;
}

export const fmtRating = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★`);

const PAUSE_KEY = "pv-driver-paused";
export function readPaused() {
  try {
    return window.localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writePaused(v: boolean) {
  try {
    if (v) window.localStorage.setItem(PAUSE_KEY, "1");
    else window.localStorage.removeItem(PAUSE_KEY);
  } catch {
    /* sem armazenamento: segue só na tela */
  }
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#F6F4EF] px-3 py-2.5">
      <p className="text-[11px] font-semibold text-[#5C6067]">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-extrabold text-[#111]">{value}</p>
    </div>
  );
}

/** Faixa de resumo em cima do mapa quando há corrida (tela B). */
export function DriverHomeStatsStrip({ summary, nextLabel }: { summary: DriverSummary | null; nextLabel: string | null }) {
  return (
    <div className="pointer-events-auto mx-auto mt-2 grid max-w-lg grid-cols-3 gap-1 rounded-2xl bg-white/95 px-4 py-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.12)] backdrop-blur">
      <span className="min-w-0">
        <span className="block text-[11px] text-[#5C6067]">Hoje</span>
        <span className="block truncate text-sm font-bold">{summary ? `${summary.done_today} feita${summary.done_today === 1 ? "" : "s"}` : "—"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-[#5C6067]">Próxima</span>
        <span className="block truncate text-sm font-bold">{nextLabel ?? "—"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-[#5C6067]">Nota</span>
        <span className="block truncate text-sm font-bold">{fmtRating(summary?.rating)}</span>
      </span>
    </div>
  );
}

/** Início sem corrida (tela A): disponível, resumo do dia, aviso da central, atalhos e pausa. */
export function DriverIdleHome({
  summary,
  nextLabel,
  preview,
  onAgenda
}: {
  summary: DriverSummary | null;
  /** Ex.: "amanhã 07:30" (próxima corrida agendada) */
  nextLabel: string | null;
  preview: boolean;
  onAgenda: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Msg | null>(null);
  useEffect(() => setPaused(readPaused()), []);
  useEffect(() => {
    if (preview) return;
    void fetch("/api/drivers/me/messages", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Msg[] }) => setNotice((j.data ?? []).find((m) => m.live) ?? null))
      .catch(() => undefined);
  }, [preview]);

  async function togglePause() {
    const next = !paused;
    setBusy(true);
    const r = await fetch("/api/drivers/operational-status", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next ? "offline" : "online" })
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      writePaused(next);
      setPaused(next);
    }
  }

  const phone = summary?.central_phone ? (summary.central_phone.startsWith("55") ? summary.central_phone : `55${summary.central_phone}`) : null;

  return (
    <>
      {notice ? (
        <div className="pointer-events-auto fixed inset-x-0 top-[calc(max(0.9rem,env(safe-area-inset-top))+4.25rem)] z-30 px-4">
          <div className="mx-auto max-w-lg rounded-[20px] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,0,0,0.10)]">
            <p className="text-xs font-bold tracking-[0.1em] text-[#8A6A1F]">AVISO DA CENTRAL</p>
            <p className="mt-0.5 line-clamp-3 text-[15px] font-semibold leading-snug text-[#111]">{notice.title}</p>
            {notice.body && notice.body !== notice.title ? <p className="mt-0.5 line-clamp-2 text-sm text-[#5C6067]">{notice.body}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-t-[28px] bg-white px-5 pb-4 pt-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.10)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#DDD8CC]" />
        <div className="mt-4 flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            {!paused ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /> : null}
            <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${paused ? "bg-[#A8ACB3]" : "bg-[#1E7A3C]"}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-extrabold text-[#111]">{paused ? "Você está em intervalo" : "Você está disponível"}</p>
            <p className="mt-0.5 text-sm text-[#5C6067]">
              {paused ? "A central vê que você está em pausa. Volte quando puder." : "Quando a central te passar uma corrida, o celular toca e ela aparece aqui."}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatBox label="Hoje" value={summary ? `${summary.done_today} feita${summary.done_today === 1 ? "" : "s"}` : "—"} />
          <StatBox label="Próxima" value={nextLabel ?? "nenhuma"} />
          <StatBox label="Nota" value={fmtRating(summary?.rating)} />
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onAgenda} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-[#E5E0D4] text-[15px] font-bold text-[#111]">
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v14H4zM4 10h16M9 3v5M15 3v5" /></svg>
            Ver agenda
          </button>
          {phone ? (
            <a href={`tel:+${phone}`} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-[#E5E0D4] text-[15px] font-bold text-[#111]">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
              Central
            </a>
          ) : (
            <span className="flex h-[52px] items-center justify-center rounded-2xl border border-[#E5E0D4] text-[15px] font-bold text-[#A8ACB3]">Central</span>
          )}
        </div>
        {!preview ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void togglePause()}
            className={`mt-2.5 h-14 w-full rounded-full text-base font-extrabold disabled:opacity-60 ${paused ? "bg-[#111] text-prime-gold" : "bg-prime-gold text-[#111]"}`}
          >
            {busy ? "Aguarde…" : paused ? "Voltar a ficar disponível" : "Pausar (fazer intervalo)"}
          </button>
        ) : null}
      </div>
    </>
  );
}

/** Etiquetas fáceis de bater o olho na agenda. */
export function tripTags(t: { flight_number?: string | null; origin_text?: string | null; destination_text?: string | null; service_type?: string; trip_dropoff_stops?: unknown }) {
  const tags: string[] = [];
  const text = `${t.origin_text ?? ""} ${t.destination_text ?? ""}`;
  if (t.flight_number || /aeroporto|airport/i.test(text)) tags.push("Aeroporto");
  if (t.flight_number) tags.push(`Voo ${t.flight_number}`);
  if (/noiv|casament/i.test(t.service_type ?? "")) tags.push("Casamento");
  const stops = Array.isArray(t.trip_dropoff_stops) ? t.trip_dropoff_stops.length : 0;
  if (stops > 1) tags.push(`${stops} paradas`);
  return tags;
}
