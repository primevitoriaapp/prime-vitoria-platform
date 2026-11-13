"use client";

import { useEffect, useState } from "react";
import type { Trip } from "@/lib/domain/types";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { linkPhones } from "@/lib/ui/link-phones";
import { tripContacts } from "@/lib/trips/trip-contacts";
import { driverIntroMessage, type DriverInfo } from "@/lib/trips/driver-intro-message";

let cachedDriver: DriverInfo | null = null;

function waPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

function firstName(s?: string | null) {
  return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Contato com o passageiro desde a confirmação: ligar, apresentar-se pelo WhatsApp com
 * texto pronto, e observações da central. Sem telefone, o motorista pede à central.
 */
export function DriverPassengerContact({ trip, devFallbackRole }: { trip: Trip; devFallbackRole: "motorista" | "admin" }) {
  const [driver, setDriver] = useState<DriverInfo | null>(cachedDriver);
  const [asked, setAsked] = useState<"idle" | "busy" | "done" | "error">("idle");
  const people = tripContacts(trip);
  const withPhone = people.filter((p) => p.phone);

  useEffect(() => {
    if (cachedDriver) return;
    void fetchWithSupabaseSession("/api/drivers/me", {}, devFallbackRole)
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { profile_name?: string | null; full_name?: string | null; phone?: string | null; vehicle?: DriverInfo["vehicle"] } }) => {
        if (!j?.success || !j.data) return;
        cachedDriver = { name: firstName(j.data.profile_name || j.data.full_name), phone: j.data.phone ?? null, vehicle: j.data.vehicle ?? null };
        setDriver(cachedDriver);
      })
      .catch(() => undefined);
  }, [devFallbackRole]);
  // O carro desta corrida (se a central escolheu outro) vale mais que o carro padrão do motorista.
  const tripVehicle = (trip as { vehicle?: { model?: string | null; plate?: string | null; color?: string | null } | null }).vehicle;
  const info: DriverInfo | null = driver ? { ...driver, vehicle: tripVehicle?.plate ? { ...tripVehicle, color: tripVehicle.color ?? (driver.vehicle?.plate === tripVehicle.plate ? driver.vehicle?.color : null) } : driver.vehicle } : null;

  async function askCentral() {
    setAsked("busy");
    const r = await fetchWithSupabaseSession(`/api/trips/${trip.id}/contact-request`, { method: "POST" }, devFallbackRole).catch(() => null);
    setAsked(r?.ok ? "done" : "error");
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6F76]">
        Falar com {people.length > 1 ? "os passageiros" : "o passageiro"}
        {trip.passenger_count && trip.passenger_count > 1 ? ` · ${trip.passenger_count} pessoas` : ""}
      </p>
      {people.length ? (
        <ul className="mt-2 divide-y divide-[#EFEBE2]">
          {people.map((p) => (
            <li key={`${p.role}-${p.name}`} className="py-3">
              <p className="text-base font-semibold text-[#111]">
                {p.name} <span className="text-xs font-normal text-[#6B6F76]">· {p.role}</span>
              </p>
              {p.phone ? (
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
                  <a href={`tel:${p.phone}`} className="rounded-2xl border border-[#E5E1D8] px-4 py-3 text-center text-sm font-semibold text-[#111]">
                    📞 Ligar
                  </a>
                  <a
                    href={`https://wa.me/${waPhone(p.phone)}?text=${encodeURIComponent(driverIntroMessage(trip, info, p))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl bg-[#25D366] px-3 py-3 text-center text-sm font-bold text-[#111]"
                  >
                    💬 Me apresentar no WhatsApp
                  </a>
                </div>
              ) : (
                <p className="text-sm text-[#6B6F76]">Sem telefone</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {withPhone.length ? (
        <p className="mt-1 text-xs text-[#6B6F76]">O WhatsApp abre com a mensagem pronta: seu nome, horário, embarque, destino, carro, placa e seu contato. Dá para mudar antes de enviar.</p>
      ) : (
        <div className="mt-2 rounded-2xl bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">A central não colocou o telefone do passageiro nesta corrida.</p>
          {asked === "done" ? (
            <p className="mt-1 text-sm text-emerald-800">✓ Pedido enviado. Assim que a central colocar o telefone, ele aparece aqui.</p>
          ) : (
            <button
              type="button"
              disabled={asked === "busy"}
              onClick={() => void askCentral()}
              className="mt-2 w-full rounded-xl bg-[#111] px-3 py-2.5 text-sm font-bold text-prime-gold disabled:opacity-60"
            >
              {asked === "busy" ? "Enviando…" : "Pedir o telefone à central"}
            </button>
          )}
          {asked === "error" ? <p className="mt-1 text-xs text-red-700">Não foi possível avisar agora. Tente de novo ou ligue para a central.</p> : null}
        </div>
      )}
      {trip.notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-[#F8F7F3] px-3 py-2 text-sm text-[#333]">{linkPhones(trip.notes)}</p> : null}
    </section>
  );
}
