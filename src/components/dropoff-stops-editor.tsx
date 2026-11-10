"use client";

import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

export type EditableStop = {
  address_text: string;
  lat: number | null;
  lng: number | null;
  passenger_name: string;
  passenger_phone: string;
  /** Quantas pessoas descem/ficam nesta parada (opcional). */
  people?: number | null;
  dropped_at?: string | null;
};

/** Quem fica no destino final (a última pessoa). Opcional. */
export type FinalStopPerson = { passenger_name: string; passenger_phone: string };
export const emptyFinalPerson = (): FinalStopPerson => ({ passenger_name: "", passenger_phone: "" });

export const emptyStop = (): EditableStop => ({ address_text: "", lat: null, lng: null, passenger_name: "", passenger_phone: "" });

/**
 * Paradas antes do destino final (ex.: deixar cada passageiro em casa).
 * Endereço obrigatório; passageiro e telefone opcionais — o motorista vê e pode ligar.
 */
export function DropoffStopsEditor({
  stops,
  onChange,
  devFallbackRole = "admin"
}: {
  stops: EditableStop[];
  onChange: (s: EditableStop[]) => void;
  devFallbackRole?: "admin" | "operador" | "cliente";
}) {
  const set = (i: number, patch: Partial<EditableStop>) => onChange(stops.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      {stops.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-prime-border bg-[#FBF8F1] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              📍 Parada {i + 1}
              {s.passenger_name.trim() ? <span className="font-normal text-prime-muted"> · {s.passenger_name.trim()}</span> : null}
            </p>
            <span className="flex gap-1">
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="h-7 w-7 rounded-lg bg-white ring-1 ring-prime-border disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                aria-label="Descer"
                disabled={i === stops.length - 1}
                onClick={() => move(i, 1)}
                className="h-7 w-7 rounded-lg bg-white ring-1 ring-prime-border disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" aria-label="Tirar parada" onClick={() => onChange(stops.filter((_, k) => k !== i))} className="h-7 w-7 rounded-lg bg-white text-red-700 ring-1 ring-prime-border">
                ×
              </button>
            </span>
          </div>
          <label className="grid gap-1 text-sm">
            <span>1. Quem fica nesta parada? <span className="text-prime-muted">(deixe em branco se não tiver nome)</span></span>
            <input className={PRIME_INPUT_CLASS} value={s.passenger_name} onChange={(e) => set(i, { passenger_name: e.target.value })} placeholder="Ex.: Vanusa" />
          </label>
          <AddressAutocompleteInput
            label={s.passenger_name.trim() ? `2. Endereço de ${s.passenger_name.trim().split(/\s+/)[0]}` : "2. Endereço da parada"}
            value={s.address_text}
            hasCoords={s.lat != null}
            onChange={(t) => set(i, { address_text: t, lat: null, lng: null })}
            onPlaceSelect={(p) => set(i, { address_text: p.displayName, lat: p.lat, lng: p.lng })}
            onCoordsClear={() => set(i, { lat: null, lng: null })}
            devFallbackRole={devFallbackRole}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
            <label className="grid gap-1 text-sm">
              <span>3. Telefone / WhatsApp (se tiver)</span>
              <input className={PRIME_INPUT_CLASS} inputMode="tel" value={s.passenger_phone} onChange={(e) => set(i, { passenger_phone: e.target.value })} placeholder="(27) 99999-9999" />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Pessoas</span>
              <input
                className={PRIME_INPUT_CLASS}
                inputMode="numeric"
                value={s.people ?? ""}
                onChange={(e) => set(i, { people: e.target.value ? Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) : null })}
                placeholder="1"
              />
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...stops, emptyStop()])}
        className="w-full rounded-xl border-2 border-dashed border-prime-gold bg-[#FBF8F1] px-3 py-3 text-sm font-bold text-[#7A5A12] hover:bg-[#F6EFDD]"
      >
        ＋ Adicionar parada{stops.length ? " (mais uma)" : " no caminho"}
      </button>
    </div>
  );
}

/** Campos de quem fica no destino final — aparece logo abaixo do "Destino final" quando há paradas. */
export function FinalStopPersonFields({ value, onChange }: { value: FinalStopPerson; onChange: (v: FinalStopPerson) => void }) {
  return (
    <div className="grid gap-2 rounded-xl border border-prime-border bg-[#FBF8F1] p-3 sm:grid-cols-2">
      <p className="text-sm font-semibold sm:col-span-2">🏁 Quem fica no destino final? <span className="font-normal text-prime-muted">(a última pessoa — opcional)</span></p>
      <label className="grid gap-1 text-sm">
        <span>Nome</span>
        <input className={PRIME_INPUT_CLASS} value={value.passenger_name} onChange={(e) => onChange({ ...value, passenger_name: e.target.value })} placeholder="Ex.: Gabriel" />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Telefone / WhatsApp (se tiver)</span>
        <input className={PRIME_INPUT_CLASS} inputMode="tel" value={value.passenger_phone} onChange={(e) => onChange({ ...value, passenger_phone: e.target.value })} placeholder="(27) 99999-9999" />
      </label>
    </div>
  );
}

type FinalDest = { text: string; lat: number | null; lng: number | null };

/**
 * Lista para a API, na ordem: paradas → (se informado) quem fica no destino final,
 * marcado com `final: true` e com o endereço do destino.
 */
export function stopsForApi(stops: EditableStop[], final?: { person: FinalStopPerson; dest: FinalDest; dropped_at?: string | null }) {
  const list: {
    passenger_name: string;
    passenger_phone: string | null;
    address_text: string;
    lat: number | null;
    lng: number | null;
    people?: number;
    dropped_at: string | null;
    final?: boolean;
  }[] = stops
    .filter((s) => s.address_text.trim().length >= 3)
    .map((s) => ({
      passenger_name: s.passenger_name.trim(),
      passenger_phone: s.passenger_phone.trim() || null,
      address_text: s.address_text.trim(),
      lat: s.lat,
      lng: s.lng,
      ...(s.people && s.people > 1 ? { people: s.people } : {}),
      dropped_at: s.dropped_at ?? null
    }));
  const name = final?.person.passenger_name.trim() ?? "";
  const phone = final?.person.passenger_phone.trim() ?? "";
  if (list.length && final && (name || phone) && final.dest.text.trim().length >= 3) {
    list.push({
      passenger_name: name,
      passenger_phone: phone || null,
      address_text: final.dest.text.trim(),
      lat: final.dest.lat,
      lng: final.dest.lng,
      dropped_at: final.dropped_at ?? null,
      final: true
    });
  }
  return list;
}
