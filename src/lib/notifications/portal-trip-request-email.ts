import { formatBrDateTime } from "@/lib/dates/br-date";
import { shortPlaceLabel } from "@/lib/trips/format-place-label";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { sendOperationalEmail, DEFAULT_OPERATIONAL_EMAIL_FROM } from "@/lib/notifications/send-email";
import { resolveAppBaseUrl } from "@/lib/server/app-base-url";

/** Destinatário das notificações de solicitação do portal (operador). */
export const PORTAL_OPS_INBOX_PRODUCTION = "contato@primevitoria.com";

/** Sandbox Resend (onboarding@resend.dev): só entrega para o e-mail da conta. */
export const PORTAL_OPS_INBOX_RESEND_SANDBOX = "contatoprimevix@gmail.com";

export function resolvePortalOpsInbox(): string {
  const override = process.env.PORTAL_OPS_INBOX?.trim();
  if (override) return override;
  const from = process.env.OPERATIONAL_EMAIL_FROM?.trim();
  if (from?.includes("@primevitoria.com")) {
    return PORTAL_OPS_INBOX_PRODUCTION;
  }
  return PORTAL_OPS_INBOX_RESEND_SANDBOX;
}

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

  const opsInbox = resolvePortalOpsInbox();

  console.info("[portal.trip_request_email] preparando envio", {
    tripId: input.tripId,
    to: opsInbox,
    from: DEFAULT_OPERATIONAL_EMAIL_FROM,
    resendApiKeyDefined: process.env.RESEND_API_KEY !== undefined,
    resendApiKeyLength: process.env.RESEND_API_KEY?.trim().length ?? 0
  });

  const result = await sendOperationalEmail({
    to: opsInbox,
    subject,
    text,
    html,
    from: DEFAULT_OPERATIONAL_EMAIL_FROM
  });

  console.info("[portal.trip_request_email] resultado", {
    tripId: input.tripId,
    sent: result.ok,
    reason: result.ok ? undefined : result.reason,
    resendId: result.ok ? result.id : undefined
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
