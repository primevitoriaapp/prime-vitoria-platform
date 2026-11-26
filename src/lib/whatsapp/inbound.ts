import { db } from "@/lib/server/db";
import { parseWebhook } from "@/lib/whatsapp/parse";

type Obj = Record<string, unknown>;

/** Grava o que veio no webhook nas tabelas de conversas. Idempotente (mesma mensagem não duplica). */
export async function ingestWhatsappEvent(tenantId: string, payload: unknown): Promise<void> {
  const { messages, contacts, statuses } = parseWebhook(payload);
  // Contatos em lote (a agenda do app chega com centenas de uma vez).
  const byWa = new Map<string, Obj>();
  for (const c of contacts) {
    const cur = byWa.get(c.wa_id) ?? { tenant_id: tenantId, wa_id: c.wa_id, updated_at: new Date().toISOString() };
    if (c.name) cur.name = c.name;
    if (c.profile_name) cur.profile_name = c.profile_name;
    byWa.set(c.wa_id, cur);
  }
  const rows = [...byWa.values()];
  for (let i = 0; i < rows.length; i += 500) {
    // Só nome/perfil: não apaga última mensagem nem não lidas de quem já existe.
    const withName = rows.slice(i, i + 500).filter((r) => r.name);
    const withProfile = rows.slice(i, i + 500).filter((r) => !r.name && r.profile_name);
    if (withName.length) await db.from("whatsapp_contacts").upsert(withName.map((r) => ({ tenant_id: r.tenant_id, wa_id: r.wa_id, name: r.name, updated_at: r.updated_at })), { onConflict: "tenant_id,wa_id" });
    if (withProfile.length) await db.from("whatsapp_contacts").upsert(withProfile, { onConflict: "tenant_id,wa_id" });
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
    // Avisos automáticos (motorista / passageiro): marca entregue, lida ou falhou, com o motivo em português.
    const noticePatch =
      s.status === "failed"
        ? { status: "falhou", detail: noticeError(s.error) }
        : s.status === "read"
          ? { detail: "Lida ✓✓" }
          : s.status === "delivered"
            ? { detail: "Entregue ✓✓" }
            : null;
    if (noticePatch) {
      const [{ data: dn }, { data: pn }] = await Promise.all([
        db.from("driver_whatsapp_notices").update(noticePatch).eq("tenant_id", tenantId).eq("provider_message_id", s.id).select("id"),
        db.from("passenger_notifications").update(noticePatch).eq("tenant_id", tenantId).eq("provider_message_id", s.id).select("id")
      ]);
      if (dn?.length || pn?.length) continue;
    }
    const upd = () =>
      db.from("whatsapp_chat_messages").update({ status: s.status, ...(s.error ? { error: s.error } : {}) }).eq("tenant_id", tenantId).eq("wa_message_id", s.id).select("id");
    let { data } = await upd();
    // O status pode chegar milissegundos antes da própria mensagem (eco do app): tenta de novo.
    if (!data?.length) {
      await new Promise((r) => setTimeout(r, 2000));
      ({ data } = await upd());
    }
  }
}

/** Motivo da falha do WhatsApp em português simples. */
function noticeError(title: string | null): string {
  const t = String(title ?? "").toLowerCase();
  if (t.includes("payment")) return "Meta recusou: problema na forma de pagamento da conta do WhatsApp";
  if (t.includes("not a valid") || t.includes("invalid") || t.includes("recipient")) return "Número inválido ou sem WhatsApp";
  if (t.includes("template")) return "Mensagem (modelo) não aprovada ou pausada na Meta";
  if (t.includes("rate") || t.includes("limit")) return "Limite de envios da Meta atingido";
  if (t.includes("re-engagement") || t.includes("24")) return "Fora da janela de 24h";
  return `Não entregue: ${title ?? "erro da Meta"}`;
}
