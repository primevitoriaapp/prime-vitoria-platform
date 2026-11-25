import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { cloudReady, getWhatsappCloudConfig, providerName, sendWhatsappText } from "@/lib/messages/whatsapp-cloud";

/**
 * Teste da conexão (só admin): envia UMA mensagem de texto para o número informado,
 * mesmo com o sistema em modo teste. Só funciona se essa pessoa mandou mensagem
 * para a central nas últimas 24 horas (regra do WhatsApp).
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const tenantId = assertTenantScope(session);
    const { phone } = z.object({ phone: z.string().trim().min(8).max(20) }).parse(await request.json());
    let wa = phone.replace(/\D/g, "");
    if (wa.length <= 11) wa = `55${wa}`;
    const c = await getWhatsappCloudConfig();
    if (!cloudReady(c)) return fail("NOT_CONFIGURED", "Falta a chave ou o ID do número.", 400);
    const { data: contact } = await db.from("whatsapp_contacts").select("last_inbound_at").eq("tenant_id", tenantId).eq("wa_id", wa).maybeSingle();
    const last = contact?.last_inbound_at ? new Date(contact.last_inbound_at).getTime() : 0;
    if (!last || Date.now() - last > 24 * 3600_000)
      return fail("WINDOW_CLOSED", "Antes do teste, mande qualquer mensagem desse número para a central (27) 2142-8307. O WhatsApp só deixa a empresa escrever livre até 24 horas depois da última mensagem da pessoa.", 409);
    const text = "✅ Teste da plataforma Prime Vitória: esta mensagem saiu pelo sistema, pelo número oficial da central.";
    const r = await sendWhatsappText(c, wa, text);
    const now = new Date().toISOString();
    await db.from("whatsapp_chat_messages").insert({
      tenant_id: tenantId,
      wa_id: wa,
      wa_message_id: r.ok ? r.id : null,
      direction: "out",
      source: "plataforma",
      type: "text",
      body: text,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : r.error,
      sent_by: session.userId,
      ts: now
    });
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "integration.whatsapp_test", entityType: "integration", entityId: null, metadata: { provider: providerName(c), ok: r.ok, wa_tail: wa.slice(-4) }, request });
    if (!r.ok) return fail("SEND_FAILED", `${providerName(c)} recusou: ${r.error}`, 502);
    await db.from("whatsapp_contacts").update({ last_message_at: now, last_preview: `Você: ${text}`.slice(0, 140) }).eq("tenant_id", tenantId).eq("wa_id", wa);
    return ok({ sent: true, provider: providerName(c) });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", "Informe o número.", 400);
    return mapApiError(e);
  }
}
