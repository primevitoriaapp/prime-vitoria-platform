import { db } from "@/lib/server/db";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { flightTrackerUrl } from "@/lib/trips/flight";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { buildTripIcs, googleCalendarLink, tripDurationMinutes } from "@/lib/notifications/trip-calendar";

const ORGANIZER = "contato@primevitoria.com";

function publicBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return (configured || "https://prime-vitoria-web.vercel.app").replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** E-mail de login sem caixa real (motorista que entra por CPF + PIN). */
export function isPlaceholderDriverEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return !e || !e.includes("@") || e.endsWith("@acesso.primevitoria.com.br");
}

/**
 * Avisa o motorista por e-mail que ele foi escalado, com convite de agenda (.ics)
 * e link do Google Agenda (lembretes 1 dia e 3 horas antes). Não mostra valores.
 */
export async function emailDriverAssignment(
  tenantId: string,
  tripId: string,
  driverId: string
): Promise<{ ok: boolean; reason?: string }> {
  const [{ data: trip }, { data: driver }] = await Promise.all([
    db.from("trips").select("*").eq("id", tripId).eq("tenant_id", tenantId).maybeSingle(),
    db.from("drivers").select("full_name, email").eq("id", driverId).eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (!trip || !driver) return { ok: false, reason: "corrida ou motorista não encontrado" };
  const email = (driver.email as string | null)?.trim().toLowerCase() ?? "";
  if (isPlaceholderDriverEmail(email)) return { ok: false, reason: "motorista sem e-mail" };

  const [{ data: client }, { data: vehicle }] = await Promise.all([
    db.from("clients").select("name, trade_name").eq("id", trip.client_id).maybeSingle(),
    trip.vehicle_id
      ? db.from("vehicles").select("model, plate").eq("id", trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const when = formatBrDateTime(trip.scheduled_at as string);
  const service = primeServiceTypeLabel(String(trip.service_type ?? ""), {
    audience: "operator",
    scheduledAt: trip.scheduled_at as string
  });
  const passenger = (trip.passenger_name as string | null)?.trim() || "A confirmar";
  const phone = (trip.passenger_phone as string | null)?.trim() || null;
  const origin = String(trip.origin_text ?? "—");
  const destination = String(trip.destination_text ?? "—");
  const flight = (trip.flight_number as string | null) ?? null;
  const notes = (trip.notes as string | null)?.trim() || null;
  const clientName = (client?.trade_name as string | null) || (client?.name as string | null) || "Cliente";
  const vehicleText = vehicle ? `${vehicle.model ?? ""}${vehicle.plate ? ` · placa ${vehicle.plate}` : ""}`.trim() : null;
  const firstName = String(driver.full_name ?? "").trim().split(/\s+/)[0] || "motorista";
  const appUrl = `${publicBaseUrl()}/driver`;

  const descriptionLines = [
    `Cliente: ${clientName}`,
    `Passageiro: ${passenger}${phone ? ` (${phone})` : ""}`,
    `Embarque: ${origin}`,
    `Destino: ${destination}`,
    flight ? `Voo: ${flight} — ${flightTrackerUrl(flight)}` : null,
    vehicleText ? `Veículo: ${vehicleText}` : null,
    notes ? `Observações: ${notes}` : null,
    `App do motorista: ${appUrl}`
  ].filter(Boolean) as string[];

  const calendarInput = {
    tripId,
    startIso: new Date(trip.scheduled_at as string).toISOString(),
    durationMinutes: tripDurationMinutes(trip.service_type as string | null),
    title: `Prime Vitória — ${passenger} (${service})`,
    description: descriptionLines.join("\n"),
    location: origin,
    organizerEmail: ORGANIZER,
    attendeeEmail: email
  };
  const ics = buildTripIcs(calendarInput);
  const gcal = googleCalendarLink(calendarInput);

  const rows: [string, string | null][] = [
    ["Data e horário", when],
    ["Serviço", service],
    ["Cliente", clientName],
    ["Passageiro", phone ? `${passenger} · ${phone}` : passenger],
    ["Embarque", origin],
    ["Destino", destination],
    ["Voo", flight],
    ["Veículo", vehicleText],
    ["Observações", notes]
  ];
  const rowsHtml = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#7A6A3A;font-size:12px;text-transform:uppercase;letter-spacing:.06em;vertical-align:top">${k}</td><td style="padding:6px 0;color:#111;font-size:14px">${escapeHtml(v as string)}${
          k === "Voo" && flight
            ? ` · <a href="${flightTrackerUrl(flight)}" style="color:#B8943E">ver horário e atraso</a>`
            : ""
        }</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#111;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0">
    <div style="font-size:18px;font-weight:bold">PRIME <span style="color:#C9A84C">VITÓRIA</span></div>
    <div style="font-size:11px;letter-spacing:.16em;color:#C9A84C">NOVA CORRIDA PARA VOCÊ</div>
  </div>
  <div style="background:#fff;padding:20px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 12px;font-size:15px;color:#111">Olá, ${escapeHtml(firstName)}! Você foi indicado para o atendimento abaixo. Seguem as informações:</p>
    <table style="border-collapse:collapse;width:100%">${rowsHtml}</table>
    <p style="margin:20px 0 8px">
      <a href="${gcal}" style="display:inline-block;background:#111;color:#C9A84C;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Adicionar ao Google Agenda</a>
      &nbsp;<a href="${appUrl}" style="display:inline-block;border:1px solid #C9A84C;color:#111;text-decoration:none;padding:10px 16px;border-radius:8px">Abrir app do motorista</a>
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#666">O convite em anexo (corrida.ics) também abre no iPhone e no Outlook, com lembretes 1 dia antes e 3 horas antes.</p>
  </div>
</div></body></html>`;

  const text = [`Olá, ${firstName}! Você foi indicado para um atendimento Prime Vitória.`, `Data e horário: ${when}`, `Serviço: ${service}`, ...descriptionLines, `Adicionar ao Google Agenda: ${gcal}`].join("\n");

  const result = await sendOperationalEmail({
    to: email,
    subject: `Nova corrida ${when} — ${passenger}`,
    text,
    html,
    attachments: [
      { filename: "corrida.ics", content: Buffer.from(ics, "utf-8").toString("base64"), content_type: "text/calendar; method=REQUEST; charset=utf-8" }
    ]
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
