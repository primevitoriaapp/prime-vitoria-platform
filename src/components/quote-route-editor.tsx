"use client";

import type { ReactNode } from "react";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

export type RoutePoint = { label: string; text: string; lat: number | null; lng: number | null };
export const emptyPoint = (label = ""): RoutePoint => ({ label, text: "", lat: null, lng: null });

const LABEL_SUGGESTIONS = ["Residência", "Hotel", "Aeroporto", "Empresa", "Salão de beleza", "Igreja", "Cerimonial", "Restaurante", "Rodoviária"];

/**
 * Roteiro do serviço, na ordem: saída → paradas → destino final.
 * Cada ponto tem um nome opcional (Igreja, Salão, Hotel…) e o endereço.
 */
export function QuoteRouteEditor({
  origin,
  stops,
  dest,
  diaria,
  locked,
  onChange
}: {
  origin: RoutePoint;
  stops: RoutePoint[];
  dest: RoutePoint;
  diaria: boolean;
  locked: boolean;
  onChange: (next: { origin?: RoutePoint; stops?: RoutePoint[]; dest?: RoutePoint }) => void;
}) {
  const setStop = (i: number, p: Partial<RoutePoint>) => onChange({ stops: stops.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ stops: next });
  };

  const row = (
    key: string,
    badge: string,
    title: string,
    p: RoutePoint,
    set: (patch: Partial<RoutePoint>) => void,
    placeholder: string,
    tools?: ReactNode
  ) => (
    <div key={key} className="grid gap-2 rounded-xl border border-prime-border bg-[#FBF8F1] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#111] px-1.5 text-xs text-prime-gold">{badge}</span>
          {title}
        </span>
        {tools}
      </div>
      <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
        <label className="grid gap-1 text-sm">
          <span>Nome do local (opcional)</span>
          <input className={PRIME_INPUT_CLASS} disabled={locked} list="quote-point-labels" value={p.label} placeholder={placeholder} onChange={(e) => set({ label: e.target.value })} />
        </label>
        <AddressAutocompleteInput
          label="Endereço"
          value={p.text}
          hasCoords={p.lat != null}
          onChange={(t) => set({ text: t, lat: null, lng: null })}
          onPlaceSelect={(x) => set({ text: x.displayName, lat: x.lat, lng: x.lng })}
          onCoordsClear={() => set({ lat: null, lng: null })}
          devFallbackRole="admin"
        />
      </div>
    </div>
  );

  return (
    <div className="grid gap-2">
      <datalist id="quote-point-labels">
        {LABEL_SUGGESTIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      {row("o", "A", diaria ? "Início (onde o carro fica à disposição)" : "Saída", origin, (x) => onChange({ origin: { ...origin, ...x } }), "Ex.: Salão de beleza")}
      {stops.map((s, i) =>
        row(
          `s${i}`,
          String(i + 1),
          `Parada ${i + 1}`,
          s,
          (x) => setStop(i, x),
          "Ex.: Igreja",
          !locked ? (
            <span className="flex gap-1">
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="h-7 w-7 rounded-lg bg-white ring-1 ring-prime-border disabled:opacity-30">
                ↑
              </button>
              <button type="button" aria-label="Descer" disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="h-7 w-7 rounded-lg bg-white ring-1 ring-prime-border disabled:opacity-30">
                ↓
              </button>
              <button type="button" aria-label="Tirar parada" onClick={() => onChange({ stops: stops.filter((_, k) => k !== i) })} className="h-7 w-7 rounded-lg bg-white text-red-700 ring-1 ring-prime-border">
                ×
              </button>
            </span>
          ) : null
        )
      )}
      {!locked ? (
        <button
          type="button"
          onClick={() => onChange({ stops: [...stops, emptyPoint()] })}
          className="w-full rounded-xl border-2 border-dashed border-prime-gold bg-[#FBF8F1] px-3 py-2.5 text-sm font-bold text-[#7A5A12] hover:bg-[#F6EFDD]"
        >
          ＋ Adicionar parada no caminho
        </button>
      ) : null}
      {row("d", "🏁", diaria ? "Fim (opcional)" : "Destino final", dest, (x) => onChange({ dest: { ...dest, ...x } }), "Ex.: Cerimonial")}
    </div>
  );
}
