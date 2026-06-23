"use client";

import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PassengerAutocompleteInput } from "@/components/passenger-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

export type PickupStopForm = {
  pickup_text: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  passenger_name: string;
  passenger_phone: string;
};

type Props = {
  clientId: string;
  stops: PickupStopForm[];
  onChange: (stops: PickupStopForm[]) => void;
  devFallbackRole?: "admin" | "operador";
};

function emptyStop(): PickupStopForm {
  return {
    pickup_text: "",
    pickup_lat: null,
    pickup_lng: null,
    passenger_name: "",
    passenger_phone: ""
  };
}

function patchStop(stops: PickupStopForm[], index: number, patch: Partial<PickupStopForm>): PickupStopForm[] {
  return stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
}

function moveStop(stops: PickupStopForm[], from: number, to: number): PickupStopForm[] {
  if (from < 0 || from >= stops.length || to < 0 || to >= stops.length || from === to) return stops;
  const next = [...stops];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PickupStopsEditor({
  clientId,
  stops,
  onChange,
  devFallbackRole = "admin"
}: Props) {
  function addStop() {
    onChange([...stops, emptyStop()]);
  }

  function removeStop(index: number) {
    if (stops.length <= 1) return;
    onChange(stops.filter((_, i) => i !== index));
  }

  return (
    <div className="md:col-span-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-prime-text">Paradas de embarque</h3>
        <button type="button" className="btn-outline text-sm" onClick={addStop}>
          + Adicionar passageiro/parada
        </button>
      </div>
      <p className="text-xs text-prime-muted">
        Cada parada pode ter endereço e passageiro diferentes. O destino final da corrida é único (abaixo).
      </p>
      {stops.map((stop, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-prime-border bg-white p-4 shadow-prime-card"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-prime-text">Parada {idx + 1}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={idx === 0}
                className="rounded border border-prime-border px-2 py-1 text-xs disabled:opacity-40"
                onClick={() => onChange(moveStop(stops, idx, idx - 1))}
                aria-label={`Subir parada ${idx + 1}`}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={idx === stops.length - 1}
                className="rounded border border-prime-border px-2 py-1 text-xs disabled:opacity-40"
                onClick={() => onChange(moveStop(stops, idx, idx + 1))}
                aria-label={`Descer parada ${idx + 1}`}
              >
                ↓
              </button>
              {stops.length > 1 ? (
                <button
                  type="button"
                  className="text-xs text-red-700 hover:underline"
                  onClick={() => removeStop(idx)}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AddressAutocompleteInput
              className="md:col-span-2"
              label="Endereço de embarque"
              required
              placeholder="Ex.: Rua das Palmeiras, 100"
              value={stop.pickup_text}
              hasCoords={stop.pickup_lat != null && stop.pickup_lng != null}
              onChange={(pickup_text) => onChange(patchStop(stops, idx, { pickup_text }))}
              onPlaceSelect={(place) =>
                onChange(
                  patchStop(stops, idx, {
                    pickup_text: place.displayName,
                    pickup_lat: place.lat,
                    pickup_lng: place.lng
                  })
                )
              }
              onCoordsClear={() => onChange(patchStop(stops, idx, { pickup_lat: null, pickup_lng: null }))}
            />
            <PassengerAutocompleteInput
              clientId={clientId}
              label="Nome do passageiro"
              required
              value={stop.passenger_name}
              onChange={(passenger_name) => onChange(patchStop(stops, idx, { passenger_name }))}
              onSelect={(p) =>
                onChange(
                  patchStop(stops, idx, {
                    passenger_name: p.name,
                    passenger_phone: p.phone ?? stop.passenger_phone,
                    ...(p.address?.trim() && !stop.pickup_text.trim()
                      ? { pickup_text: p.address.trim() }
                      : {})
                  })
                )
              }
              devFallbackRole={devFallbackRole}
            />
            <label className="grid gap-1 text-sm">
              <span>Telefone</span>
              <input
                type="tel"
                className={PRIME_INPUT_CLASS}
                value={stop.passenger_phone}
                onChange={(e) => onChange(patchStop(stops, idx, { passenger_phone: e.target.value }))}
                placeholder="+55 27 99999-0000"
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

export function defaultPickupStopForm(): PickupStopForm {
  return emptyStop();
}
