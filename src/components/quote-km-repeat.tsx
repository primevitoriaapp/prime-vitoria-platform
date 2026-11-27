"use client";

import { useEffect, useRef, useState } from "react";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { itemDates, weekdaysLabel } from "@/lib/quotes/quote-calc";
import type { RoutePoint } from "@/components/quote-route-editor";

const input = PRIME_INPUT_CLASS;
const onlyNum = (v: string) => v.replace(/[^0-9.,]/g, "");

/**
 * Serviço por km: o km sai da rota (o servidor localiza os endereços e calcula o trajeto de carro);
 * dá para corrigir na mão. Valor = maior entre km da rota e km mínimo × R$/km.
 */
export function QuoteKmFields({
  origin,
  stops,
  dest,
  km,
  kmAuto,
  kmMin,
  pricePerKm,
  driverPricePerKm,
  locked,
  onChange,
  onPoints
}: {
  origin: RoutePoint;
  stops: RoutePoint[];
  dest: RoutePoint;
  km: string;
  kmAuto: boolean;
  kmMin: string;
  pricePerKm: string;
  driverPricePerKm: string;
  locked: boolean;
  onChange: (p: { km?: string; km_auto?: boolean; km_min?: string; price_per_km?: string; driver_price_per_km?: string }) => void;
  onPoints?: (p: { origin: RoutePoint; stops: RoutePoint[]; dest: RoutePoint }) => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const filledStops = stops.filter((s) => s.text.trim().length >= 3 || s.lat != null);
  const all = [origin, ...filledStops, dest];
  const ready = origin.text.trim().length >= 3 && dest.text.trim().length >= 3;
  const routeKey = all.map((p) => (p.lat != null ? `${p.lat.toFixed(5)},${p.lng?.toFixed(5)}` : p.text.trim().toLowerCase())).join("|");
  const allCoords = all.every((p) => p.lat != null && p.lng != null);
  const last = useRef<string>("");

  async function calc(force = false) {
    if (!ready) {
      setStatus("Preencha a saída e o destino.");
      return;
    }
    if (!force && last.current === routeKey) return;
    last.current = routeKey;
    setBusy(true);
    setStatus("Calculando a rota…");
    try {
      const res = await fetchWithSupabaseSession(
        "/api/maps/route-km",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: all.map((p) => ({ text: p.text, lat: p.lat, lng: p.lng })) }) },
        "admin"
      );
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { km: number; source: string; points: { lat: number; lng: number; found: boolean }[] };
        error?: { message?: string };
      };
      if (!res.ok || !j.success || !j.data) {
        setStatus(j.error?.message ?? "Não consegui calcular. Digite o km.");
        return;
      }
      const d = j.data;
      // Guarda as coordenadas achadas (assim a corrida também nasce com o mapa certo).
      if (onPoints && d.points.some((p) => p.found) && d.points.length === all.length) {
        const fix = (p: RoutePoint, k: number): RoutePoint => (p.lat != null ? p : { ...p, lat: d.points[k].lat, lng: d.points[k].lng });
        const o = fix(origin, 0);
        const ds = fix(dest, all.length - 1);
        let k = 1;
        const st = stops.map((s) => (s.text.trim().length >= 3 || s.lat != null ? fix(s, k++) : s));
        last.current = [o, ...st.filter((s) => s.text.trim().length >= 3 || s.lat != null), ds]
          .map((p) => `${p.lat?.toFixed(5)},${p.lng?.toFixed(5)}`)
          .join("|");
        onPoints({ origin: o, stops: st, dest: ds });
      }
      onChange({ km: String(d.km).replace(".", ","), km_auto: true });
      setStatus(d.source === "linha_reta" ? "Estimativa (linha reta + 30%). Confira e corrija se precisar." : "Km calculado pela rota de carro.");
    } catch {
      setStatus("Não consegui calcular. Digite o km.");
    } finally {
      setBusy(false);
    }
  }

  // Automático: com os endereços escolhidos na lista, recalcula sempre que a rota muda.
  useEffect(() => {
    if (locked || !kmAuto || !ready || !allCoords) return;
    void calc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, allCoords, ready, kmAuto, locked]);

  const kmN = Number(String(km).replace(",", ".")) || 0;
  const minN = Number(String(kmMin).replace(",", ".")) || 0;

  return (
    <div className="grid gap-3 rounded-xl border border-[#EADFC4] bg-[#FBF7EC] p-3 sm:col-span-6 sm:grid-cols-4">
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span>Km do trajeto</span>
        <div className="flex gap-2">
          <input className={input} inputMode="decimal" disabled={locked} placeholder="0" value={km} onChange={(e) => onChange({ km: onlyNum(e.target.value), km_auto: false })} />
          {!locked ? (
            <button
              type="button"
              disabled={busy}
              className="shrink-0 rounded-lg bg-[#111] px-3 text-xs font-semibold text-[#fff] disabled:opacity-60"
              onClick={() => void calc(true)}
            >
              {busy ? "…" : "📍 Calcular km"}
            </button>
          ) : null}
        </div>
        <span className="text-[12px] text-prime-muted">
          {status || (ready ? (allCoords ? "Sai sozinho da rota." : "Clique em Calcular km.") : "Preencha a saída e o destino.")}
        </span>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span>Km mínimo (opcional)</span>
        <input className={input} inputMode="decimal" disabled={locked} placeholder="Ex.: 50" value={kmMin} onChange={(e) => onChange({ km_min: onlyNum(e.target.value) })} />
        <span className="text-[12px] text-prime-muted">
          {minN > kmN && kmN > 0 ? `Rota tem ${String(kmN).replace(".", ",")} km: cobra o mínimo de ${String(minN).replace(".", ",")} km.` : "Se a rota der menos, cobra o mínimo."}
        </span>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span>Cliente paga por km (R$)</span>
        <input className={input} inputMode="decimal" disabled={locked} placeholder="0,00" value={pricePerKm} onChange={(e) => onChange({ price_per_km: onlyNum(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span>Motorista recebe por km (R$)</span>
        <input className={`${input} bg-prime-bg`} inputMode="decimal" disabled={locked} placeholder="0,00" value={driverPricePerKm} onChange={(e) => onChange({ driver_price_per_km: onlyNum(e.target.value) })} />
        <span className="text-[12px] text-prime-muted">Interno: não aparece para o cliente</span>
      </label>
    </div>
  );
}

const DAYS = [
  { d: 1, l: "Seg" },
  { d: 2, l: "Ter" },
  { d: 3, l: "Qua" },
  { d: 4, l: "Qui" },
  { d: 5, l: "Sex" },
  { d: 6, l: "Sáb" },
  { d: 0, l: "Dom" }
];

/** Rotina semanal: repete o serviço nos dias marcados, da data do serviço até a data final. */
export function QuoteRepeatFields({
  date,
  days,
  until,
  quantity,
  locked,
  onChange
}: {
  date: string;
  days: number[];
  until: string;
  quantity: number;
  locked: boolean;
  onChange: (p: { repeat_days?: number[]; repeat_until?: string }) => void;
}) {
  const on = days.length > 0 || Boolean(until);
  const dates = itemDates({ service_date: date || null, repeat_weekdays: days, repeat_until: until || null });
  const toggle = (d: number) => onChange({ repeat_days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] });
  const br = (ymd: string) => ymd.split("-").reverse().join("/");

  if (!on) {
    return locked ? null : (
      <button
        type="button"
        className="justify-self-start text-sm font-semibold text-prime-gold-ink hover:underline sm:col-span-6"
        onClick={() => onChange({ repeat_days: [1, 2, 3, 4, 5] })}
      >
        🔁 Repetir este serviço em dias da semana (rotina)
      </button>
    );
  }
  return (
    <div className="grid gap-2 rounded-xl border border-prime-border bg-[#F6F8FB] p-3 text-sm sm:col-span-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">🔁 Rotina: repetir nos dias</span>
        {!locked ? (
          <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => onChange({ repeat_days: [], repeat_until: "" })}>
            Não repetir
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {DAYS.map((x) => (
          <button
            key={x.d}
            type="button"
            disabled={locked}
            onClick={() => toggle(x.d)}
            className={`min-w-[3rem] rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${days.includes(x.d) ? "bg-[#111] text-[#fff] ring-[#111]" : "bg-white ring-prime-border hover:ring-prime-gold"}`}
          >
            {x.l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span>De</span>
          <input className={`${input} w-40`} value={date ? br(date) : "use a Data acima"} disabled />
        </label>
        <label className="grid gap-1">
          <span>Até</span>
          <input type="date" className={`${input} w-44 ${!until ? "ring-1 ring-amber-300" : ""}`} disabled={locked} min={date || undefined} value={until} onChange={(e) => onChange({ repeat_until: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-prime-muted">
        {!date
          ? "Coloque a data do primeiro dia no campo Data."
          : !until
            ? "Escolha até quando repete."
            : !days.length
              ? "Marque pelo menos um dia."
              : dates.length
                ? (
                  <>
                    <b className="text-prime-text">
                      {weekdaysLabel(days)}: {dates.length} dia(s)
                    </b>{" "}
                    × {quantity} veículo(s) = <b className="text-prime-text">{dates.length * quantity} corrida(s)</b>. Ao aprovar, cada uma entra na Agenda no seu dia, no mesmo horário.
                  </>
                )
                : "Nenhum dia marcado cai dentro desse período."}
      </p>
    </div>
  );
}
