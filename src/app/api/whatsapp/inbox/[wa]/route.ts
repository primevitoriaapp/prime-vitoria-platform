import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { cloudReady, getWhatsappCloudConfig, markWhatsappRead, sendWhatsappText } from "@/lib/messages/whatsapp-cloud";

export const dynamic = "force-dynamic";
const WINDOW_MS = 24 * 3600_000;

async function staff() {
  const session = await getSessionContext();
  if (!["admin", "operador"].includes(session.role)) return { session, tenantId: null as string | null };
  return { session, tenantId: assertTenantScope(session) };
}

/** Conversa com um contato. Ao abrir, zera o "não lidas" e marca como lida no WhatsApp (se o envio estiver ligado). */
export async function GET(_req: Request, { params }: { params: Promise<{ wa: string }> }) {
  try {
    const { tenantId } = await staff();
    if (!tenantId) return fail("FORBIDDEN", "Sem permissão", 403);
    const wa = (await params).wa.replace(/\D/g, "");
    const [{ data: contact }, { data: msgs }] = await Promise.all([
      db.from("whatsapp_contacts").select("wa_id, name, profile_name, last_inbound_at, unread").eq("tenant_id", tenantId).eq("wa_id", wa).maybeSingle(),
      db.from("whatsapp_chat_messages").select("id, wa_message_id, direction, source, type, body, status, error, ts").eq("tenant_id", tenantId).eq("wa_id", wa).order("ts", { ascending: false }).limit(300)
    ]);
    if (contact?.unread) {
      await db.from("whatsapp_contacts").update({ unread: 0 }).eq("tenant_id", tenantId).eq("wa_id", wa);
      const c = await getWhatsappCloudConfig();
      const lastIn = (msgs ?? []).find((m) => m.direction === "in" && m.source === "cliente" && m.wa_message_id);
      if (c.mode === "ligado" && cloudReady(c) && lastIn?.wa_message_id) await markWhatsappRead(c, lastIn.wa_message_id);
    }
    const lastIn = contact?.last_inbound_at ? new Date(contact.last_inbound_at).getTime() : 0;
    return ok({
      contact: contact ?? { wa_id: wa, name: null, profile_name: null },
      window_open: lastIn > 0 && Date.now() - lastIn < WINDOW_MS,
      window_ends_at: lastIn ? new Date(lastIn + WINDOW_MS).toISOString() : null,
      messages: (msgs ?? []).reverse()
    });
  } catch (e) {
    return mapApiError(e);
  }
}

/** Responde pelo número da central. Em modo teste, só registra (não envia). */
export async function POST(request: Request, { params }: { params: Promise<{ wa: string }> }) {
  try {
    const { session, tenantId } = await staff();
    if (!tenantId) return fail("FORBIDDEN", "Sem permissão", 403);
    const wa = (await params).wa.replace(/\D/g, "");
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(await request.json());
    const { data: contact } = await db.from("whatsapp_contacts").select("last_inbound_at").eq("tenant_id", tenantId).eq("wa_id", wa).maybeSingle();
    const lastIn = contact?.last_inbound_at ? new Date(contact.last_inbound_at).getTime() : 0;
    if (!lastIn || Date.now() - lastIn >= WINDOW_MS)
      return fail("WINDOW_CLOSED", "Já passaram 24 horas desde a última mensagem do cliente. Pela regra do WhatsApp, agora só dá para mandar um modelo aprovado (ou responder pelo app do celular).", 409);
    const c = await getWhatsappCloudConfig();
    const live = c.mode === "ligado" && cloudReady(c);
    const r = live ? await sendWhatsappText(c, wa, text) : null;
    const now = new Date().toISOString();
    const row = {
      tenant_id: tenantId,
      wa_id: wa,
      wa_message_id: r && r.ok ? r.id : null,
      direction: "out",
      source: "plataforma",
      type: "text",
      body: text,
      status: !live ? "teste" : r?.ok ? "sent" : "failed",
      error: r && !r.ok ? r.error : null,
      sent_by: session.userId,
      ts: now
    };
    const { data: saved } = await db.from("whatsapp_chat_messages").insert(row).select("id, wa_message_id, direction, source, type, body, status, error, ts").single();
    if (!r || r.ok) await db.from("whatsapp_contacts").update({ last_message_at: now, last_preview: `Você: ${text}`.slice(0, 140), unread: 0 }).eq("tenant_id", tenantId).eq("wa_id", wa);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "whatsapp.reply", entityType: "whatsapp_contact", entityId: null, metadata: { wa_tail: wa.slice(-4), modo: live ? "enviado" : "teste", ok: r ? r.ok : null }, request });
    if (r && !r.ok) return fail("SEND_FAILED", `Não foi enviado: ${r.error}`, 502);
    return ok({ message: saved, test_mode: !live });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", "Escreva a mensagem.", 400);
    return mapApiError(e);
  }
}
