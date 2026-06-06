import { formatBrDateTime } from "@/lib/dates/br-date";
import { shortPlaceLabel } from "@/lib/trips/format-place-label";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { resolveAppBaseUrl } from "@/lib/server/app-base-url";

export const PORTAL_OPS_INBOX = "contato@primevitoria.com";

export type PortalTripRequestEmailInput = {
  clientName: string;
  serviceType: string;
  scheduledAt: string;
  originText: string;
  destinationText: string;
  tripId: string;
};

export async function notifyPortalTripRequestedEmail(
  input: PortalTripRequestEmailInput
): Promise<{ sent: boolean; reason?: string }> {
  const serviceLabel = primeServiceTypeLabel(input.serviceType, {
    audience: "operator",
    scheduledAt: input.scheduledAt
  });
  const when = formatBrDateTime(input.scheduledAt) || input.scheduledAt;
  const origin = shortPlaceLabel(input.originText);
  const destination = shortPlaceLabel(input.destinationText);

  const subject = `Nova solicitação — ${input.clientName}`;
  const text = [
    "Nova corrida solicitada pelo portal do cliente.",
    "",
    `Cliente: ${input.clientName}`,
    `Serviço: ${serviceLabel}`,
    `Origem: ${origin}`,
    `Destino: ${destination}`,
    `Data e horário: ${when}`,
    `Status: Solicitada`,
    "",
    `ID: ${input.tripId}`,
    `Abrir agenda: ${resolveAppBaseUrl()}/agenda?trip=${input.tripId}`
  ].join("\n");

  const html = `
    <p><strong>Nova corrida solicitada pelo portal do cliente.</strong></p>
    <ul>
      <li><strong>Cliente:</strong> ${escapeHtml(input.clientName)}</li>
      <li><strong>Serviço:</strong> ${escapeHtml(serviceLabel)}</li>
      <li><strong>Origem:</strong> ${escapeHtml(origin)}</li>
      <li><strong>Destino:</strong> ${escapeHtml(destination)}</li>
      <li><strong>Data e horário:</strong> ${escapeHtml(when)}</li>
      <li><strong>Status:</strong> Solicitada</li>
    </ul>
    <p style="font-size:12px;color:#666">ID: ${escapeHtml(input.tripId)}</p>
  `.trim();

  const result = await sendOperationalEmail({
    to: PORTAL_OPS_INBOX,
    subject,
    text,
    html
  });

  if (!result.ok) {
    return { sent: false, reason: result.reason };
  }
  return { sent: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
