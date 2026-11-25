import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { ingestWhatsappEvent } from "@/lib/whatsapp/inbound";
import { getWhatsappCloudConfig, cloudReady, providerName } from "@/lib/messages/whatsapp-cloud";

export const dynamic = "force-dynamic";

/** Lista de conversas do WhatsApp da central (mais recentes primeiro). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);

    // Processa eventos que chegaram e ainda não viraram conversa (inclui o histórico da conexão).
    const { data: pending } = await db.from("whatsapp_inbound_events").select("id, payload").eq("tenant_id", tenantId).is("processed_at", null).order("received_at").limit(40);
    for (const ev of pending ?? []) {
      try {
        await ingestWhatsappEvent(tenantId, ev.payload);
        await db.from("whatsapp_inbound_events").update({ processed_at: new Date().toISOString() }).eq("id", ev.id);
      } catch {
        /* tenta de novo na próxima abertura */
      }
    }

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    let query = db
      .from("whatsapp_contacts")
      .select("wa_id, name, profile_name, last_message_at, last_inbound_at, last_preview, unread")
      .eq("tenant_id", tenantId)
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(q ? 200 : 80);
    if (q) {
      const d = q.replace(/\D/g, "");
      query = d.length >= 4 ? query.ilike("wa_id", `%${d}%`) : query.or(`name.ilike.%${q}%,profile_name.ilike.%${q}%`);
    }
    const { data } = await query;
    const c = await getWhatsappCloudConfig();
    return ok({
      mode: c.mode,
      can_send: c.mode === "ligado" && cloudReady(c),
      provider: providerName(c),
      pending_events: (pending ?? []).length === 40,
      conversations: data ?? []
    });
  } catch (e) {
    return mapApiError(e);
  }
}
