import type { Trip } from "../domain/types.ts";

export type DriverInfo = { name: string; phone: string | null; vehicle: { model?: string | null; plate?: string | null; color?: string | null } | null };

function firstName(s?: string | null) {
  return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Tribunal Regional do Trabalho da 17ª Região, Av. Nossa Sra. dos Navegantes, 1245 - Enseada…" → dois primeiros trechos. */
function shortAddress(a?: string | null): string {
  return String(a ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function formatPhone(p?: string | null): string {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(p ?? "").trim();
}

/**
 * Mensagem de apresentação do motorista ao passageiro: quem é, onde e quando embarca,
 * para onde vai, carro e placa, contato. O motorista ainda pode editar antes de enviar.
 */
export function driverIntroMessage(
  trip: Pick<Trip, "scheduled_at" | "origin_text" | "destination_text" | "passenger_name" | "flight_number">,
  driver: DriverInfo | null,
  person?: { name?: string | null; pickup?: string | null; dropoff?: string | null }
): string {
  const tz = "America/Sao_Paulo";
  const d = new Date(String(trip.scheduled_at));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: tz });
  const day = d.toLocaleDateString("en-CA", { timeZone: tz });
  const ddmm = d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
  const dia = day === today ? `hoje (${ddmm})` : day === tomorrow ? `amanhã (${ddmm})` : `no dia ${ddmm}`;
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const pax = firstName(person?.name && person.name !== "Passageiro" ? person.name : trip.passenger_name);
  const embarque = shortAddress(person?.pickup || trip.origin_text);
  const destino = shortAddress(person?.dropoff || trip.destination_text);
  const v = driver?.vehicle ?? null;
  const carro = [v?.model, v?.color].filter(Boolean).join(" ");
  const nome = driver?.name || "o motorista";

  const lines = [
    `Olá${pax ? `, ${pax}` : ""}! Tudo bem?`,
    "",
    `Me chamo ${nome}, sou motorista da Prime Vitória e serei o responsável pelo seu atendimento ${dia}.`,
    "",
    `🕐 *Horário:* ${hora}`,
    `📍 *Embarque:* ${embarque || "local combinado"}`
  ];
  if (destino) lines.push(`🏁 *Destino:* ${destino}`);
  if (carro || v?.plate) lines.push(`🚘 *Veículo:* ${carro || "—"}${v?.plate ? ` · placa *${String(v.plate).toUpperCase()}*` : ""}`);
  if (driver?.phone) lines.push(`📱 *Meu contato:* ${formatPhone(driver.phone)}`);
  lines.push("");
  if (trip.flight_number) {
    lines.push(`Vou acompanhar o voo ${trip.flight_number} — se houver atraso ou mudança, fico sabendo e me ajusto.`);
  }
  lines.push(
    "Estarei no local no horário marcado. Se houver qualquer alteração, ou se preferir um ponto de encontro específico, é só me avisar por aqui que alinhamos o melhor embarque para você.",
    "",
    "Até breve!"
  );
  return lines.join("\n");
}

