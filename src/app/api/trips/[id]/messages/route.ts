import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { loadTripMessageContext } from "@/lib/messages/trip-message-context";
import {
  AUDIENCE_LABEL,
  MESSAGE_EVENTS,
  renderTemplate,
  whatsappLink
} from "@/lib/messages/templates";

/** Mensagens prontas desta corrida (texto + link do WhatsApp) para a central enviar. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const ctx = await loadTripMessageContext(tenantId, id);
    if (!ctx) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const { base, recipients, templates } = ctx;

    const messages = templates
      .filter((t) => t.audience !== "operador")
      .map((t) => {
        const r = recipients[t.audience];
        const text = renderTemplate(t.body, { ...base, nome: r.name });
        const ev = MESSAGE_EVENTS.find((e) => e.id === t.event);
        return {
          event: t.event,
          event_label: ev?.label ?? t.event,
          audience: t.audience,
          audience_label: AUDIENCE_LABEL[t.audience],
          text,
          phone: r.phone,
          whatsapp_url: whatsappLink(r.phone, text)
        };
      });

    return ok(messages);
  } catch (error) {
    return mapApiError(error);
  }
}
