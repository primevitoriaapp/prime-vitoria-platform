"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { saoPauloDateAndTimeToUtcIso } from "@/lib/dates/br-date";
import { PRESENTATION_OPTIONS, SERVICE_EXTRAS } from "@/lib/trips/service-extras";

type Trip = {
  id: string;
  operational_status: string;
  scheduled_at: string;
  origin_text: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_text: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  passenger_count?: number | null;
  flight_number?: string | null;
  notes?: string | null;
  presentation_minutes?: number | null;
  service_extras?: string[] | null;
  driver_id?: string | null;
};

const LOCKED = new Set(["completed", "cancelled", "rejected", "no_show"]);
const input = PRIME_INPUT_CLASS;

function spParts(iso: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(iso));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}

/** Botão "Editar corrida" na tela da corrida: muda horário, trajeto, passageiro e marcações, com motivo. */
export function TripEditPanel({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [origin, setOrigin] = useState({ text: "", lat: null as number | null, lng: null as number | null });
  const [dest, setDest] = useState({ text: "", lat: null as number | null, lng: null as number | null });
  const [paxName, setPaxName] = useState("");
  const [paxPhone, setPaxPhone] = useState("");
  const [paxCount, setPaxCount] = useState(1);
  const [flight, setFlight] = useState("");
  const [notes, setNotes] = useState("");
  const [presentation, setPresentation] = useState(0);
  const [extras, setExtras] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/trips/${tripId}`, {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Trip };
      if (!res.ok || !json.success || !json.data) {
        setMsg({ ok: false, text: "Não foi possível carregar a corrida." });
        return;
      }
      const t = json.data;
      setTrip(t);
      const p = spParts(t.scheduled_at);
      setDate(p.date);
      setTime(p.time);
      setOrigin({ text: t.origin_text ?? "", lat: t.origin_lat ?? null, lng: t.origin_lng ?? null });
      setDest({ text: t.destination_text ?? "", lat: t.destination_lat ?? null, lng: t.destination_lng ?? null });
      setPaxName(t.passenger_name ?? "");
      setPaxPhone(t.passenger_phone ?? "");
      setPaxCount(t.passenger_count ?? 1);
      setFlight(t.flight_number ?? "");
      setNotes(t.notes ?? "");
      setPresentation(t.presentation_minutes ?? 0);
      setExtras(t.service_extras ?? []);
      setReason("");
    })();
  }, [open, tripId]);

  const locked = trip ? LOCKED.has(trip.operational_status) : false;

  async function save() {
    if (!trip) return;
    const scheduled = saoPauloDateAndTimeToUtcIso(date, time);
    if (!locked && !scheduled) {
      setMsg({ ok: false, text: "Data ou horário inválido." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const payload = locked
      ? { notes, reason }
      : {
          scheduled_at: scheduled,
          origin_text: origin.text,
          origin_lat: origin.lat,
          origin_lng: origin.lng,
          destination_text: dest.text,
          destination_lat: dest.lat,
          destination_lng: dest.lng,
          passenger_name: paxName,
          passenger_phone: paxPhone,
          passenger_count: paxCount,
          flight_number: flight,
          notes,
          presentation_minutes: presentation,
          service_extras: extras,
          reason
        };
    const res = await fetchWithSupabaseSession(`/api/trips/${trip.id}`, { method: "PATCH", body: JSON.stringify(payload) }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { _unchanged?: boolean }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMsg({ ok: false, text: json.error?.message ?? "Não foi possível salvar." });
      return;
    }
    setMsg({
      ok: true,
      text: json.data?._unchanged
        ? "Nada mudou."
        : trip.driver_id
          ? "Salvo. A O.S. atualizada foi enviada ao motorista."
          : "Salvo."
    });
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-prime-border bg-white shadow-prime-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold"
      >
        <span>✎ Editar corrida</span>
        <span className="text-sm text-prime-muted">{open ? "Fechar" : "Horário, trajeto, passageiro, marcações"}</span>
      </button>
      {open ? (
        <div className="grid gap-4 border-t border-prime-border p-4 md:grid-cols-2">
          {!trip ? (
            <p className="text-sm text-prime-muted">Carregando…</p>
          ) : (
            <>
              {locked ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">
                  Corrida encerrada: só as observações podem mudar. Valores se corrigem no quadro de valores ou no Relatório por cliente.
                </p>
              ) : (
                <>
                  <label className="grid gap-1 text-sm">
                    <span>Data</span>
                    <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Horário</span>
                    <input type="time" step={300} className={input} value={time} onChange={(e) => setTime(e.target.value)} />
                  </label>
                  <div className="md:col-span-2">
                    <AddressAutocompleteInput
                      label="Embarque"
                      value={origin.text}
                      hasCoords={origin.lat != null}
                      onChange={(t) => setOrigin({ text: t, lat: null, lng: null })}
                      onPlaceSelect={(p) => setOrigin({ text: p.displayName, lat: p.lat, lng: p.lng })}
                      onCoordsClear={() => setOrigin((o) => ({ ...o, lat: null, lng: null }))}
                      devFallbackRole="admin"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <AddressAutocompleteInput
                      label="Destino"
                      value={dest.text}
                      hasCoords={dest.lat != null}
                      onChange={(t) => setDest({ text: t, lat: null, lng: null })}
                      onPlaceSelect={(p) => setDest({ text: p.displayName, lat: p.lat, lng: p.lng })}
                      onCoordsClear={() => setDest((o) => ({ ...o, lat: null, lng: null }))}
                      devFallbackRole="admin"
                    />
                  </div>
                  <label className="grid gap-1 text-sm">
                    <span>Passageiro</span>
                    <input className={input} value={paxName} onChange={(e) => setPaxName(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>WhatsApp do passageiro</span>
                    <input className={input} value={paxPhone} onChange={(e) => setPaxPhone(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Nº de passageiros</span>
                    <input type="number" min={1} className={input} value={paxCount} onChange={(e) => setPaxCount(Math.max(1, Number(e.target.value) || 1))} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Voo</span>
                    <input className={input} value={flight} onChange={(e) => setFlight(e.target.value)} />
                  </label>
                  <div className="grid gap-2 text-sm md:col-span-2">
                    <span>Motorista chega antes do horário</span>
                    <div className="flex flex-wrap gap-2">
                      {PRESENTATION_OPTIONS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPresentation(m)}
                          className={`rounded-full px-3 py-1.5 ring-1 ${presentation === m ? "bg-[#111] text-[#fff] ring-[#111]" : "ring-prime-border"}`}
                        >
                          {m === 0 ? "No horário" : `${m} min antes`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 text-sm md:col-span-2">
                    <span>Marcações da reserva</span>
                    <div className="flex flex-wrap gap-2">
                      {SERVICE_EXTRAS.map((e) => {
                        const on = extras.includes(e.id);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setExtras((l) => (on ? l.filter((x) => x !== e.id) : [...l, e.id]))}
                            className={`rounded-full px-3 py-1.5 ring-1 ${on ? "bg-prime-gold font-semibold text-[#111] ring-prime-gold" : "ring-prime-border"}`}
                          >
                            {on ? "✓ " : ""}
                            {e.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>Observações para o motorista</span>
                <textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>Motivo da alteração (fica no histórico)</span>
                <input className={input} placeholder="Ex.: cliente mudou o voo" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              {msg ? (
                <p className={`rounded-lg px-3 py-2 text-sm md:col-span-2 ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>
              ) : null}
              <div className="md:col-span-2">
                <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void save()}>
                  {busy ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
