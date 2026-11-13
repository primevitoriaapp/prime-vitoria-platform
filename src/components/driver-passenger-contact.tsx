"use client";

import { useEffect, useState } from "react";
import type { Trip } from "@/lib/domain/types";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { presentationAtIso } from "@/lib/trips/service-extras";
import { linkPhones } from "@/lib/ui/link-phones";
import { tripContacts } from "@/lib/trips/trip-contacts";

let cachedName: string | null = null;

function waPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

function firstName(s?: string | null) {
  return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Texto de apresentação do motorista ao passageiro (ele ainda pode editar no WhatsApp antes de enviar). */
export function driverIntroMessage(trip: Trip, driverName: string, personName?: string | null): string {
  const tz = "America/Sao_Paulo";
  const at = presentationAtIso(trip.scheduled_at, (trip as { presentation_minutes?: number | null }).presentation_minutes) ?? trip.scheduled_at;
  const d = new Date(String(trip.scheduled_at));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: tz });
  const day = d.toLocaleDateString("en-CA", { timeZone: tz });
  const dia = day === today ? "hoje" : day === tomorrow ? "amanhã" : `no dia ${d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" })}`;
  const hora = new Date(String(at)).toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const local = String(trip.origin_text ?? "").split(",")[0].trim();
  const pax = firstName(personName ?? trip.passenger_name);
  const lines = [
    `Olá${pax ? `, ${pax}` : ""}! Tudo bem?`,
    `Sou ${driverName || "o motorista"}, da Prime Vitória, e vou te atender ${dia} às ${hora}${local ? ` em ${local}` : ""}.`
  ];
  if (trip.flight_number) lines.push(`Vou acompanhar o voo ${trip.flight_number}. Se houver atraso ou mudança, pode me avisar por aqui.`);
  lines.push("Tem algum ponto de encontro de preferência? Qualquer mudança, é só me chamar por aqui.");
  return lines.join("\n");
}

/**
 * Contato com o passageiro desde a confirmação: ligar, apresentar-se pelo WhatsApp com
 * texto pronto, e observações da central. Sem telefone, o motorista pede à central.
 */
export function DriverPassengerContact({ trip, devFallbackRole }: { trip: Trip; devFallbackRole: "motorista" | "admin" }) {
  const [name, setName] = useState<string>(cachedName ?? "");
  const [asked, setAsked] = useState<"idle" | "busy" | "done" | "error">("idle");
  const people = tripContacts(trip);
  const withPhone = people.filter((p) => p.phone);

  useEffect(() => {
    if (cachedName) return;
    void fetchWithSupabaseSession("/api/drivers/me", {}, devFallbackRole)
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { profile_name?: string | null; full_name?: string | null } }) => {
        const n = firstName(j?.data?.profile_name || j?.data?.full_name);
        if (n) {
          cachedName = n;
          setName(n);
        }
      })
      .catch(() => undefined);
  }, [devFallbackRole]);

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
                    href={`https://wa.me/${waPhone(p.phone)}?text=${encodeURIComponent(driverIntroMessage(trip, name, p.name === "Passageiro" ? null : p.name))}`}
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
        <p className="mt-1 text-xs text-[#6B6F76]">O WhatsApp abre com uma mensagem pronta (seu nome, horário, local e ponto de encontro). Dá para mudar antes de enviar.</p>
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
