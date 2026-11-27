"use client";

import { useEffect, useRef, useState } from "react";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { routeKm } from "@/lib/maps/route-km";
import { itemDates, weekdaysLabel } from "@/lib/quotes/quote-calc";
import type { RoutePoint } from "@/components/quote-route-editor";

const input = PRIME_INPUT_CLASS;
const onlyNum = (v: string) => v.replace(/[^0-9.,]/g, "");

/**
 * Serviço por km: o km sai da rota pelo GPS (pode corrigir na mão) e o valor é km × R$/km.
 * Recalcula sozinho quando a rota muda, enquanto o km não foi digitado na mão.
 */
export function QuoteKmFields({
  origin,
  stops,
  dest,
  km,
  kmAuto,
  pricePerKm,
  driverPricePerKm,
  locked,
  onChange
}: {
  origin: RoutePoint;
  stops: RoutePoint[];
  dest: RoutePoint;
  km: string;
  kmAuto: boolean;
  pricePerKm: string;
  driverPricePerKm: string;
  locked: boolean;
  onChange: (p: { km?: string; km_auto?: boolean; price_per_km?: string; driver_price_per_km?: string }) => void;
}) {
  const [status, setStatus] = useState<string>("");
  const pts = [origin, ...stops, dest].filter((p) => p.lat != null && p.lng != null) as Array<RoutePoint & { lat: number; lng: number }>;
  const routeKey = pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  const allSet = origin.lat != null && dest.lat != null && stops.every((s) => !s.text.trim() || s.lat != null);
  const last = useRef<string>("");

  async function calc(force = false) {
    if (!allSet || pts.length < 2) {
      setStatus("Escolha os endereços na lista (saída e destino) para o GPS calcular.");
      return;
    }
    if (!force && last.current === routeKey) return;
    last.current = routeKey;
    setStatus("Calculando a rota…");
    const r = await routeKm(pts.map((p) => ({ lat: p.lat, lng: p.lng })));
    if (!r) {
      setStatus("Não consegui calcular. Digite o km.");
      return;
    }
    onChange({ km: String(r.km).replace(".", ","), km_auto: true });
    setStatus(r.source === "google" ? "Km calculado pela rota do GPS." : "Estimativa (linha reta + 30%). Confira e corrija se precisar.");
  }

  useEffect(() => {
    if (locked || !kmAuto) return;
    void calc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, allSet, kmAuto, locked]);

  return (
    <div className="grid gap-3 rounded-xl border border-[#EADFC4] bg-[#FBF7EC] p-3 sm:col-span-6 sm:grid-cols-3">
      <label className="grid gap-1 text-sm">
        <span>Km do trajeto</span>
        <div className="flex gap-2">
          <input
            className={input}
            inputMode="decimal"
            disabled={locked}
            placeholder="0"
            value={km}
            onChange={(e) => onChange({ km: onlyNum(e.target.value), km_auto: false })}
          />
          {!locked ? (
            <button type="button" className="shrink-0 rounded-lg px-3 text-xs font-semibold ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => void calc(true)}>
              📍 GPS
            </button>
          ) : null}
        </div>
        <span className="text-[12px] text-prime-muted">{status || (kmAuto ? "Sai sozinho da rota." : "Digitado na mão.")}</span>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Cliente paga por km (R$)</span>
        <input className={input} inputMode="decimal" disabled={locked} placeholder="0,00" value={pricePerKm} onChange={(e) => onChange({ price_per_km: onlyNum(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-sm">
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
