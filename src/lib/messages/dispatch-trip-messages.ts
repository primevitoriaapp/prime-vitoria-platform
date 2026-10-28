import { db } from "@/lib/server/db";
import { renderTemplate, type MessageAudience, type MessageEventId } from "@/lib/messages/templates";
import { loadTripMessageContext, samePhone } from "@/lib/messages/trip-message-context";
import { sendWhatsappText, whatsappProviderConfigured } from "@/lib/messages/whatsapp-provider";

/**
 * Registra as mensagens do evento na fila do painel WhatsApp e, se o WhatsApp
 * automático estiver ligado, já envia. Nunca duplica (corrida + evento + público).
 */
export async function dispatchTripMessages(
  tenantId: string,
  tripId: string,
  event: MessageEventId,
  audiences: MessageAudience[],
  opts?: { replace?: boolean }
): Promise<{ queued: number; sent: number }> {
  if (opts?.replace) {
    // Ex.: troca de motorista — as mensagens novas substituem as anteriores do mesmo evento.
    await db.from("whatsapp_messages").delete().eq("trip_id", tripId).eq("event", event).in("audience", audiences);
  }
  const ctx = await loadTripMessageContext(tenantId, tripId);
  if (!ctx) return { queued: 0, sent: 0 };
  const auto = whatsappProviderConfigured();
  let queued = 0;
  let sent = 0;

  for (const audience of audiences) {
    const tpl = ctx.templates.find((t) => t.event === event && t.audience === audience);
    if (!tpl) continue;
    const r = ctx.recipients[audience];
    // Quem pediu é o próprio passageiro: manda só a do passageiro (mais completa).
    if (audience === "solicitante" && audiences.includes("passageiro") && samePhone(r.phone, ctx.recipients.passageiro.phone)) continue;
    const body = renderTemplate(tpl.body, { ...ctx.base, nome: r.name });
    const status = r.phone ? "pendente" : "ignorada";

    const { data: row, error } = await db
      .from("whatsapp_messages")
      .insert({
        tenant_id: tenantId,
        trip_id: tripId,
        event,
        audience,
        recipient_name: r.name || null,
        phone: r.phone,
        body,
        status,
        error: r.phone ? null : "Sem telefone cadastrado"
      })
      .select("id")
      .single();
    if (error || !row) continue; // já existe (mesma corrida/evento/público)
    queued += 1;

    if (auto && r.phone) {
      const res = await sendWhatsappText(r.phone, body);
      await db
        .from("whatsapp_messages")
        .update(
          res.ok
            ? { status: "enviada", sent_at: new Date().toISOString(), provider_message_id: res.id }
            : { status: "falhou", error: res.error }
        )
        .eq("id", row.id);
      if (res.ok) sent += 1;
    }
  }
  return { queued, sent };
}
