import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { pushToDriver } from "@/lib/push/web-push";
import { targetDriverIds } from "@/lib/drivers/driver-messages";

const STAFF = ["admin", "operador", "financeiro"];

/** Avisos da central para o app do motorista: lista com quem leu e quem respondeu. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { data: msgs, error } = await db
      .from("driver_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const ids = (msgs ?? []).map((m) => m.id as string);
    const { data: rec } = ids.length
      ? await db.from("driver_message_receipts").select("message_id, driver_id, read_at, answer, answered_at").in("message_id", ids)
      : { data: [] };
    const { data: drivers } = await db.from("drivers").select("id, full_name, phone, whatsapp").eq("tenant_id", tenantId);
    const dmap = new Map((drivers ?? []).map((d) => [d.id as string, d]));
    const out = [];
    for (const m of msgs ?? []) {
      const targets = await targetDriverIds(tenantId, (m.target_category_ids as string[] | null) ?? null);
      const rs = (rec ?? []).filter((r) => r.message_id === m.id);
      const person = (id: string) => {
        const d = dmap.get(id);
        return { driver_id: id, name: String(d?.full_name ?? "Motorista"), phone: (d?.whatsapp ?? d?.phone ?? null) as string | null };
      };
      out.push({
        ...m,
        total: targets.length,
        read: rs.filter((r) => r.read_at).length,
        interested: rs.filter((r) => r.answer === "interessado").map((r) => ({ ...person(r.driver_id as string), at: r.answered_at })),
        unavailable: rs.filter((r) => r.answer === "indisponivel").map((r) => person(r.driver_id as string)),
        not_read: targets.filter((id) => !rs.some((r) => r.driver_id === id && r.read_at)).map(person)
      });
    }
    return ok(out);
  } catch (e) {
    return mapApiError(e);
  }
}

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  contact_hint: z.string().trim().max(200).optional().nullable(),
  ask_interest: z.boolean().default(true),
  target_category_ids: z.array(z.string().uuid()).max(20).optional().nullable(),
  expires_hours: z.number().int().min(1).max(24 * 30).optional().nullable()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const b = schema.parse(await request.json());
    const cats = b.target_category_ids?.length ? b.target_category_ids : null;
    const { data, error } = await db
      .from("driver_messages")
      .insert({
        tenant_id: tenantId,
        title: b.title,
        body: b.body,
        contact_hint: b.contact_hint || null,
        ask_interest: b.ask_interest,
        target_category_ids: cats,
        created_by: session.userId,
        expires_at: b.expires_hours ? new Date(Date.now() + b.expires_hours * 3600_000).toISOString() : null
      })
      .select("*")
      .single();
    if (error) return fail("SAVE_FAILED", error.message, 500);
    const targets = await targetDriverIds(tenantId, cats);
    let pushed = 0;
    for (const id of targets) {
      pushed += await pushToDriver(tenantId, id, {
        title: `📣 ${b.title}`,
        body: b.body.slice(0, 140),
        url: "/driver?aviso=1",
        tag: `aviso-${data.id}`
      }).catch(() => 0);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "driver_message.create", entityType: "driver_message", entityId: data.id as string, metadata: { targets: targets.length, pushed }, request });
    return ok({ ...data, targets: targets.length, pushed });
  } catch (e) {
    return mapApiError(e);
  }
}
