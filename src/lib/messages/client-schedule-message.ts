/**
 * Mensagem para o CLIENTE com as corridas agendadas (para copiar e mandar no WhatsApp).
 * Função pura. Não leva telefone do motorista: o contato do cliente é sempre a Central.
 */
export type ScheduleTrip = {
  scheduled_at: string;
  passenger_name: string | null;
  passenger_count: number | null;
  origin_text: string | null;
  destination_text: string | null;
  flight_number: string | null;
  driver_name: string | null;
  vehicle: { brand?: string | null; model: string; color?: string | null; plate: string } | null;
  stops?: string[];
};

export const CENTRAL_PHONES = "(27) 2142-8307 | (27) 99806-3956";

const TZ = "America/Sao_Paulo";

export function greetingFor(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${dm}`;
}

const hhmm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** "Rua X, 10 - Bairro, Vitória - ES, 29000-000, Brasil" → sem CEP e sem "Brasil". */
function cleanPlace(t: string | null): string {
  return String(t ?? "—")
    .replace(/,?\s*\d{5}-?\d{3}/, "")
    .replace(/,?\s*Brasil\s*$/i, "")
    .trim();
}

function firstLast(name: string | null): string | null {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
}

export function buildClientScheduleMessage(input: { clientName: string; trips: ScheduleTrip[]; now?: Date }): string {
  const now = input.now ?? new Date();
  const trips = [...input.trips].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const lines: string[] = [];
  const n = trips.length;
  lines.push(`${greetingFor(now)}! Tudo bem?`);
  lines.push("");
  lines.push(
    n === 1
      ? `Segue a confirmação do atendimento agendado para *${input.clientName}*:`
      : `Segue a programação dos *${n} atendimentos* agendados para *${input.clientName}*:`
  );
  let lastDay = "";
  for (const t of trips) {
    const day = dayLabel(t.scheduled_at);
    if (day !== lastDay) {
      lines.push("");
      lines.push(`📅 *${day}*`);
      lastDay = day;
    }
    lines.push("");
    const pax = t.passenger_name?.trim() || "Passageiro a confirmar";
    const extra = t.passenger_count && t.passenger_count > 1 && !pax.includes(",") ? ` (${t.passenger_count} passageiros)` : "";
    lines.push(`🕐 *${hhmm(t.scheduled_at)}* — ${pax}${extra}`);
    lines.push(`📍 Embarque: ${cleanPlace(t.origin_text)}`);
    for (const s of t.stops ?? []) lines.push(`   ↳ Parada: ${cleanPlace(s)}`);
    lines.push(`🏁 Destino: ${cleanPlace(t.destination_text)}`);
    if (t.flight_number) lines.push(`✈️ Voo: ${t.flight_number} (acompanhamos atrasos)`);
    const v = t.vehicle;
    const car = v ? [[v.brand, v.model].filter(Boolean).join(" "), v.color, v.plate ? `placa ${v.plate}` : null].filter(Boolean).join(" · ") : null;
    const driver = firstLast(t.driver_name);
    lines.push(driver ? `🚘 Motorista: ${driver}${car ? ` · ${car}` : ""}` : "🚘 Motorista e veículo: a confirmar (enviamos assim que definidos)");
  }
  lines.push("");
  lines.push(`Qualquer ajuste de horário ou passageiro, é só nos avisar por aqui ou na Central 24h: ${CENTRAL_PHONES}.`);
  lines.push("");
  lines.push("Obrigado pela confiança!");
  lines.push("*Prime Vitória* | Transporte Executivo");
  return lines.join("\n");
}
