import { db } from "@/lib/server/db";
import { parseWebhook } from "@/lib/whatsapp/parse";

type Obj = Record<string, unknown>;

/** Grava o que veio no webhook nas tabelas de conversas. Idempotente (mesma mensagem não duplica). */
export async function ingestWhatsappEvent(tenantId: string, payload: unknown): Promise<void> {
  const { messages, contacts, statuses } = parseWebhook(payload);
  for (const c of contacts) {
    const patch: Obj = { tenant_id: tenantId, wa_id: c.wa_id, updated_at: new Date().toISOString() };
    if (c.name) patch.name = c.name;
    if (c.profile_name) patch.profile_name = c.profile_name;
    await db.from("whatsapp_contacts").upsert(patch, { onConflict: "tenant_id,wa_id" });
  }
  for (const m of messages) {
    const { error } = await db.from("whatsapp_chat_messages").insert({ tenant_id: tenantId, ...m });
    if (error) continue; // já existia
    const { data: cur } = await db.from("whatsapp_contacts").select("last_message_at, last_inbound_at, unread").eq("tenant_id", tenantId).eq("wa_id", m.wa_id).maybeSingle();
    const newer = !cur?.last_message_at || m.ts >= String(cur.last_message_at);
    const patch: Obj = { tenant_id: tenantId, wa_id: m.wa_id, updated_at: new Date().toISOString() };
    if (newer) {
      patch.last_message_at = m.ts;
      patch.last_preview = `${m.direction === "out" ? "Você: " : ""}${m.body ?? ""}`.slice(0, 140);
    }
    if (m.direction === "in" && (!cur?.last_inbound_at || m.ts > String(cur.last_inbound_at))) patch.last_inbound_at = m.ts;
    if (m.direction === "in" && m.source === "cliente") patch.unread = Number(cur?.unread ?? 0) + 1;
    if (m.direction === "out" && m.source === "app") patch.unread = 0; // respondeu pelo app
    await db.from("whatsapp_contacts").upsert(patch, { onConflict: "tenant_id,wa_id" });
  }
  for (const s of statuses) {
    await db.from("whatsapp_chat_messages").update({ status: s.status, ...(s.error ? { error: s.error } : {}) }).eq("tenant_id", tenantId).eq("wa_message_id", s.id);
  }
}
