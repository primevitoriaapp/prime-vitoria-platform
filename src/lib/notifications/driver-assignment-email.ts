import { db } from "@/lib/server/db";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";
import { driverPayoutDateForTrip } from "@/lib/finance/driver-payout-sync";
import { buildDriverOsPdf, cityFromAddress } from "@/lib/vouchers/driver-os-pdf";
import { parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";
import { presentationAtIso } from "@/lib/trips/service-extras";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { flightTrackerUrl } from "@/lib/trips/flight";
import { loadLogoBytes } from "@/lib/quotes/quote-document";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { buildTripIcs, googleCalendarLink, tripDurationMinutes } from "@/lib/notifications/trip-calendar";

const ORGANIZER = "contato@primevitoria.com";
const CENTRAL_PHONES = "(27) 2142-8307 | (27) 99806-3956";

function publicBaseUrl(): string {
  return OFFICIAL_URLS.motorista;
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
 * Avisa o motorista por e-mail que ele foi escalado (ou que a corrida mudou), com a O.S. em PDF,
 * convite de agenda (.ics) e link do Google Agenda (lembretes 1 dia e 3 horas antes).
 * Valor e data prevista só para parceiro; funcionário não vê valores.
 */
export async function emailDriverAssignment(
  tenantId: string,
  tripId: string,
  driverId: string,
  opts: { version?: "nova" | "atualizada" } = {}
): Promise<{ ok: boolean; reason?: string }> {
  const version = opts.version ?? "nova";
  const [{ data: trip }, { data: driver }] = await Promise.all([
    db.from("trips").select("*").eq("id", tripId).eq("tenant_id", tenantId).maybeSingle(),
    db.from("drivers").select("full_name, email, employment_type").eq("id", driverId).eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (!trip || !driver) return { ok: false, reason: "corrida ou motorista não encontrado" };
  const email = (driver.email as string | null)?.trim().toLowerCase() ?? "";
  if (isPlaceholderDriverEmail(email)) return { ok: false, reason: "motorista sem e-mail" };

  const [{ data: client }, { data: vehicle }] = await Promise.all([
    db.from("clients").select("type, billing_issuer").eq("id", trip.client_id).maybeSingle(),
    trip.vehicle_id
      ? db.from("vehicles").select("model, plate").eq("id", trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  const company = await getTenantCompanyProfile(tenantId);
  const issuer = billingIssuerById((client?.billing_issuer as string | null) ?? null);
  const companyName = issuer?.legal_name ?? company.legal_name;
  const companyCnpj = issuer?.cnpj ?? company.cnpj;
  const osNumber = String(tripId).slice(0, 8).toUpperCase();

  // Parceiro vê quanto recebe e quando (estimativa); funcionário não.
  const amount = trip.driver_amount == null ? null : Number(trip.driver_amount);
  const isPartner = driver.employment_type !== "funcionario";
  let pay: { amount: string; forecast: string | null } | null = null;
  if (isPartner && amount != null && Number.isFinite(amount) && amount > 0) {
    const fc = await driverPayoutDateForTrip(tripId).catch(() => null);
    pay = {
      amount: amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      forecast: fc
        ? new Date(`${fc.payout}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
        : null
    };
  }

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
  // O motorista nunca vê quem é o cliente (proteção comercial): só o tipo de atendimento.
  const kindLabel = String(client?.type ?? "").toUpperCase() === "PF" ? "Corrida particular" : "Corrida empresarial";
  const vehicleText = vehicle ? `${vehicle.model ?? ""}${vehicle.plate ? ` · placa ${vehicle.plate}` : ""}`.trim() : null;
  const appUrl = `${publicBaseUrl()}/driver`;

  const descriptionLines = [
    `Atendimento: ${kindLabel}`,
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

  const presentationIso = presentationAtIso(trip.scheduled_at as string, trip.presentation_minutes as number | null);
  const presentationText =
    presentationIso && trip.presentation_minutes ? `${formatBrDateTime(presentationIso)} (${trip.presentation_minutes} min antes)` : null;
  const driverFullName = String(driver.full_name ?? "").trim() || "motorista";
  const dateOnly = new Date(trip.scheduled_at as string).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const updated = version === "atualizada";

  // Ordem pedida pelo Rubens; extras (voo, veículo, observações, valor) só aparecem quando existem.
  const mainRows: [string, string | null][] = [
    ["Data e horário", when],
    ["Apresentação no local", presentationText],
    ["Origem", origin],
    ["Destino", destination],
    ["Passageiro", phone ? `${passenger} · ${phone}` : passenger],
    ["Serviço", `${service} · ${kindLabel}`],
    ["Voo", flight],
    ["Veículo", vehicleText],
    ["Observações", notes],
    ["Valor do serviço", pay ? `${pay.amount}${pay.forecast ? ` · pagamento previsto ${pay.forecast}` : ""} (estimativa)` : null]
  ];
  const mainRowsHtml = mainRows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 14px 7px 0;color:#7A6A3A;font-size:12px;font-weight:bold;white-space:nowrap;vertical-align:top;border-bottom:1px solid #EFEAE0">${k}:</td><td style="padding:7px 0;color:#111;font-size:14px;border-bottom:1px solid #EFEAE0">${escapeHtml(v as string)}${
          k === "Voo" && flight ? ` · <a href="${flightTrackerUrl(flight)}" style="color:#B8943E">acompanhar voo</a>` : ""
        }</td></tr>`
    )
    .join("");
  const P = 'style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#222"';

  const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0B0B0B;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;border-bottom:3px solid #C9A84C">
    <table style="border-collapse:collapse;width:100%"><tr>
      <td style="width:64px;padding-right:14px"><img src="${OFFICIAL_URLS.central}/api/public/brand-logo" width="60" height="60" alt="Prime Vitória" style="display:block;border-radius:10px;background:#fff"></td>
      <td><div style="font-size:19px;font-weight:bold;letter-spacing:.04em">PRIME <span style="color:#C9A84C">VITÓRIA</span></div>
      <div style="font-size:10.5px;letter-spacing:.14em;color:#C9A84C;margin-top:3px">TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA</div></td>
      <td style="text-align:right;font-size:11px;color:#bbb;white-space:nowrap">${updated ? "O.S. ATUALIZADA" : "SERVIÇO ATRIBUÍDO"}<br><b style="color:#C9A84C;font-size:15px">Nº ${osNumber}</b></td>
    </tr></table>
  </div>
  <div style="background:#fff;padding:22px 22px 18px;border-radius:0 0 12px 12px">
    <p ${P}>Olá, ${escapeHtml(driverFullName)}.</p>
    <p ${P}>${
      updated
        ? "O serviço abaixo, atribuído a você pela Prime Vitória, foi <b>atualizado</b>. Confira os novos dados e a Ordem de Serviço anexada, que substitui a anterior, antes do atendimento."
        : "A Prime Vitória atribuiu a você o serviço abaixo. Confira os dados e a Ordem de Serviço anexada antes do atendimento."
    }</p>
    <table style="border-collapse:collapse;width:100%;margin:4px 0 16px">${mainRowsHtml}</table>
    <p ${P}>Por favor, <b>confirme o recebimento no aplicativo</b> assim que possível. Registre o início, o KM inicial, a conclusão e o KM final pelo app. Se identificar alguma divergência ou ocorrer um imprevisto, avise imediatamente a Central 24h da Prime Vitória.</p>
    <p ${P}>O convite de agenda segue anexo para inclusão dos lembretes.</p>
    <p style="margin:6px 0 18px">
      <a href="${appUrl}" style="display:inline-block;background:#111;color:#C9A84C;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Abrir app do motorista</a>
      &nbsp;<a href="${gcal}" style="display:inline-block;border:1px solid #C9A84C;color:#111;text-decoration:none;padding:10px 16px;border-radius:8px">Adicionar ao Google Agenda</a>
    </p>
    <p ${P}>Obrigado por atender pela Prime Vitória.</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#222;border-top:1px solid #EFEAE0;padding-top:12px">
      <b>Prime Vitória</b> | Transporte Executivo<br>
      Central 24h: ${CENTRAL_PHONES}<br>
      <a href="mailto:contato@primevitoria.com" style="color:#8A6D1F">contato@primevitoria.com</a>
    </p>
    <p style="margin:12px 0 0;font-size:11px;color:#888">${escapeHtml(companyName)} · CNPJ ${escapeHtml(companyCnpj)}</p>
  </div>
</div></body></html>`;

  const text = [
    `Olá, ${driverFullName}.`,
    "",
    updated
      ? "O serviço abaixo, atribuído a você pela Prime Vitória, foi atualizado. Confira os novos dados e a Ordem de Serviço anexada, que substitui a anterior, antes do atendimento."
      : "A Prime Vitória atribuiu a você o serviço abaixo. Confira os dados e a Ordem de Serviço anexada antes do atendimento.",
    "",
    ...mainRows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    "Por favor, confirme o recebimento no aplicativo assim que possível. Registre o início, o KM inicial, a conclusão e o KM final pelo app. Se identificar alguma divergência ou ocorrer um imprevisto, avise imediatamente a Central 24h da Prime Vitória.",
    "",
    "O convite de agenda segue anexo para inclusão dos lembretes.",
    `App do motorista: ${appUrl}`,
    "",
    "Obrigado por atender pela Prime Vitória.",
    "Prime Vitória | Transporte Executivo",
    `Central 24h: ${CENTRAL_PHONES}`,
    "contato@primevitoria.com"
  ].join("\n");

  const logo = await loadLogoBytes(company.logo_storage_path ?? null).catch(() => null);
  const dropoffs = parseDropoffStops(trip.trip_dropoff_stops);
  const pickups = parseTripPickupStops(trip.trip_pickup_stops);
  const pdf = buildDriverOsPdf({
    logo,
    centralPhones: CENTRAL_PHONES,
    number: osNumber,
    version,
    issuedAt: formatBrDateTime(new Date().toISOString()),
    company: { name: companyName, cnpj: companyCnpj, address: company.address_line, phone: company.phone, email: company.email },
    when,
    service,
    kindLabel,
    city: cityFromAddress(origin),
    driverPhone: null,
    passenger,
    passengerPhone: phone,
    origin,
    destination,
    stops: dropoffs.length
      ? dropoffs.map((x) => ({ name: [x.passenger_name, x.passenger_phone].filter(Boolean).join(" · ") || "Parada", address: x.address_text }))
      : pickups.length > 1
        ? pickups.map((x) => ({ name: x.passenger_name, address: x.pickup_text }))
        : [],
    stopsArePickups: !dropoffs.length && pickups.length > 1,
    flight,
    presentation: presentationText,
    vehicle: vehicleText,
    driverName: String(driver.full_name ?? "").trim() || "Motorista",
    notes,
    pay,
    appUrl: OFFICIAL_URLS.motorista
  });

  const result = await sendOperationalEmail({
    to: email,
    subject: `${updated ? "Serviço atualizado" : "Serviço atribuído"} | OS nº ${osNumber} | ${dateOnly}`,
    text,
    html,
    attachments: [
      { filename: `OS-${osNumber}.pdf`, content: Buffer.from(pdf).toString("base64"), content_type: "application/pdf" },
      { filename: "corrida.ics", content: Buffer.from(ics, "utf-8").toString("base64"), content_type: "text/calendar; method=REQUEST; charset=utf-8" }
    ]
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
