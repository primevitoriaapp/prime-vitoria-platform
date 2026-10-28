import { db } from "@/lib/server/db";
import {
  MESSAGE_EVENTS,
  type MessageAudience,
  type MessageEventId
} from "@/lib/messages/templates";

export type EffectiveTemplate = {
  event: MessageEventId;
  audience: MessageAudience;
  body: string;
  is_custom: boolean;
  client_id: string | null;
};

type Row = { event: string; audience: string; body: string; client_id: string | null; active: boolean };

/** Texto que vale: exceção do cliente > texto da empresa > padrão Prime. */
export async function loadEffectiveTemplates(tenantId: string, clientId?: string | null): Promise<EffectiveTemplate[]> {
  let rows: Row[] = [];
  try {
    let q = db.from("message_templates").select("event, audience, body, client_id, active").eq("tenant_id", tenantId).eq("active", true);
    q = clientId ? q.or(`client_id.is.null,client_id.eq.${clientId}`) : q.is("client_id", null);
    const { data } = await q;
    rows = (data ?? []) as Row[];
  } catch {
    rows = [];
  }

  const out: EffectiveTemplate[] = [];
  for (const ev of MESSAGE_EVENTS) {
    for (const [aud, def] of Object.entries(ev.defaults) as Array<[MessageAudience, string]>) {
      const clientRow = clientId ? rows.find((r) => r.event === ev.id && r.audience === aud && r.client_id === clientId) : undefined;
      const tenantRow = rows.find((r) => r.event === ev.id && r.audience === aud && r.client_id == null);
      const chosen = clientRow ?? tenantRow;
      out.push({
        event: ev.id,
        audience: aud,
        body: chosen?.body ?? def,
        is_custom: Boolean(chosen),
        client_id: clientRow ? clientId ?? null : null
      });
    }
  }
  return out;
}

export async function saveTemplate(
  tenantId: string,
  input: { event: MessageEventId; audience: MessageAudience; body: string; client_id?: string | null }
): Promise<Error | null> {
  const clientId = input.client_id ?? null;
  let del = db.from("message_templates").delete().eq("tenant_id", tenantId).eq("event", input.event).eq("audience", input.audience);
  del = clientId ? del.eq("client_id", clientId) : del.is("client_id", null);
  const { error: delErr } = await del;
  if (delErr) return new Error(delErr.message);
  const { error } = await db.from("message_templates").insert({
    tenant_id: tenantId,
    event: input.event,
    audience: input.audience,
    body: input.body,
    client_id: clientId,
    updated_at: new Date().toISOString()
  });
  return error ? new Error(error.message) : null;
}

export async function restoreDefaultTemplate(
  tenantId: string,
  input: { event: MessageEventId; audience: MessageAudience; client_id?: string | null }
): Promise<Error | null> {
  let del = db.from("message_templates").delete().eq("tenant_id", tenantId).eq("event", input.event).eq("audience", input.audience);
  del = input.client_id ? del.eq("client_id", input.client_id) : del.is("client_id", null);
  const { error } = await del;
  return error ? new Error(error.message) : null;
}
