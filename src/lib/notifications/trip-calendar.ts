/** Convite de agenda (.ics) e link do Google Agenda para a corrida do motorista. */

export type TripCalendarInput = {
  tripId: string;
  startIso: string;
  /** Duração prevista em minutos (diária = 600). */
  durationMinutes: number;
  title: string;
  description: string;
  location: string;
  organizerEmail: string;
  attendeeEmail?: string | null;
  /** Data de criação/atualização (DTSTAMP). */
  now?: Date;
};

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapa texto conforme RFC 5545 (vírgula, ponto e vírgula, barra, quebra de linha). */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Quebra linhas longas em 75 octetos (aprox. por caractere). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

export function buildTripIcs(input: TripCalendarInput): string {
  const start = new Date(input.startIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const stamp = input.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prime Vitoria//Plataforma//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:trip-${input.tripId}@primevitoria.com`,
    `DTSTAMP:${icsDate(stamp)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    `DESCRIPTION:${icsEscape(input.description)}`,
    `LOCATION:${icsEscape(input.location)}`,
    `ORGANIZER;CN=Prime Vitória:mailto:${input.organizerEmail}`,
    ...(input.attendeeEmail
      ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`]
      : []),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Corrida amanhã",
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Corrida em 3 horas",
    "TRIGGER:-PT3H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Link "Adicionar ao Google Agenda" (abre o evento já preenchido). */
export function googleCalendarLink(input: Pick<TripCalendarInput, "startIso" | "durationMinutes" | "title" | "description" | "location">): string {
  const start = new Date(input.startIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", input.title);
  url.searchParams.set("dates", `${icsDate(start)}/${icsDate(end)}`);
  url.searchParams.set("details", input.description);
  url.searchParams.set("location", input.location);
  url.searchParams.set("ctz", "America/Sao_Paulo");
  return url.toString();
}

/** Duração prevista por serviço (minutos). */
export function tripDurationMinutes(serviceType: string | null | undefined): number {
  const s = serviceType ?? "";
  if (s.startsWith("diaria")) return 600;
  return 90;
}
