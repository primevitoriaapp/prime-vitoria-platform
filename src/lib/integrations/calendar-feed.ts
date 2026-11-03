/** Agenda da Prime para assinar no Google Agenda / iPhone (feed .ics por link secreto). */
import { icsEscape } from "../notifications/trip-calendar.ts";

export type FeedTrip = {
  id: string;
  scheduled_at: string;
  service_type?: string | null;
  operational_status: string;
  origin_text?: string | null;
  destination_text?: string | null;
  passenger_name?: string | null;
  passenger_count?: number | null;
  passenger_phone?: string | null;
  flight_number?: string | null;
  presentation_minutes?: number | null;
  notes?: string | null;
  client_name?: string | null;
  driver_name?: string | null;
  vehicle?: string | null;
  flight_eta?: string | null;
  flight_delay_minutes?: number | null;
};

const STATUS_PT: Record<string, string> = {
  requested: "Aguardando aprovação",
  approved: "Agendada",
  dispatched: "Enviada ao motorista",
  accepted: "Motorista confirmado",
  reassigned: "Trocando motorista",
  on_the_way: "Motorista a caminho",
  arrived: "Motorista no local",
  in_progress: "Em andamento",
  completed: "Finalizada",
  no_show: "Passageiro não compareceu"
};

const TOKEN_RE = /^[a-f0-9]{40}$/;

/** Aceita "abc…" ou "abc….ics" (alguns apps exigem a extensão). */
export function normalizeFeedToken(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase().replace(/\.ics$/, "");
  return TOKEN_RE.test(t) ? t : null;
}

export function newFeedToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

function durationMinutes(serviceType: string | null | undefined): number {
  const s = serviceType ?? "";
  if (s.startsWith("diaria")) return 600;
  if (s.startsWith("disposicao") || s.includes("hora")) return 240;
  return 90;
}

function shortPlace(t: string | null | undefined): string {
  const s = (t ?? "").trim();
  if (!s) return "";
  return s.split(" - ")[0].split(",")[0].trim();
}

/** Título curto que cabe no celular: "Cliente · Passageiro → Destino". */
export function feedEventTitle(t: FeedTrip): string {
  const who = t.client_name?.trim() || "Corrida";
  const pax = t.passenger_name?.trim();
  const dest = shortPlace(t.destination_text);
  const flight = t.flight_number ? ` ✈ ${t.flight_number}` : "";
  const noDriver = t.driver_name ? "" : " ⚠ sem motorista";
  return `${who}${pax ? ` · ${pax}` : ""}${dest ? ` → ${dest}` : ""}${flight}${noDriver}`;
}

/** Descrição do evento. Sem valores: o link é secreto, mas preço nunca sai do sistema. */
export function feedEventDescription(t: FeedTrip, appUrl: string): string {
  const lines = [
    `Situação: ${STATUS_PT[t.operational_status] ?? t.operational_status}`,
    `Motorista: ${t.driver_name ?? "a definir"}${t.vehicle ? ` (${t.vehicle})` : ""}`,
    `Passageiro: ${t.passenger_name?.trim() || "a definir"}${t.passenger_count && t.passenger_count > 1 ? ` (+${t.passenger_count - 1})` : ""}${t.passenger_phone ? ` · ${t.passenger_phone}` : ""}`,
    `Origem: ${t.origin_text ?? "-"}`,
    `Destino: ${t.destination_text ?? "-"}`
  ];
  if (t.flight_number) {
    let f = `Voo: ${t.flight_number}`;
    if (t.flight_eta) {
      const eta = new Date(t.flight_eta).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      f += ` · previsto ${eta}`;
      if (t.flight_delay_minutes && t.flight_delay_minutes > 0) f += ` (atraso ${t.flight_delay_minutes} min)`;
    }
    lines.push(f);
  }
  if (t.presentation_minutes) lines.push(`Chegar ${t.presentation_minutes} min antes`);
  if (t.notes?.trim()) lines.push(`Obs.: ${t.notes.trim()}`);
  lines.push("", `Abrir no sistema: ${appUrl.replace(/\/$/, "")}/agenda?trip=${t.id}`);
  return lines.join("\n");
}

export function buildCalendarFeed(trips: FeedTrip[], opts: { appUrl: string; name?: string; now?: Date }): string {
  const stamp = icsDate(opts.now ?? new Date());
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prime Vitoria//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(opts.name ?? "Prime Vitória · Corridas")}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H"
  ];
  for (const t of trips) {
    const start = new Date(t.scheduled_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + durationMinutes(t.service_type) * 60_000);
    out.push(
      "BEGIN:VEVENT",
      `UID:feed-${t.id}@primevitoria.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(feedEventTitle(t))}`,
      `DESCRIPTION:${icsEscape(feedEventDescription(t, opts.appUrl))}`,
      `LOCATION:${icsEscape(t.origin_text ?? "")}`,
      `STATUS:${t.operational_status === "requested" ? "TENTATIVE" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }
  out.push("END:VCALENDAR");
  return out.map(fold).join("\r\n") + "\r\n";
}
