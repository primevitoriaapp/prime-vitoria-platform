import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { getHealthAlertConfig, runHealthCheck, saveHealthAlertConfig } from "@/lib/health/run-and-notify";

const cfgSchema = z.object({
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().max(200).default(""),
  whatsapp: z.boolean().default(true),
  send_email: z.boolean().default(true),
  push: z.boolean().default(true)
});

/** Última checagem, histórico curto e para onde vão os alertas. Só admin. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const tenantId = assertTenantScope(session);
    const [{ data: runs }, config] = await Promise.all([
      db.from("system_health_checks").select("id, ran_at, trigger, problems, critical, items, notified").eq("tenant_id", tenantId).order("ran_at", { ascending: false }).limit(15),
      getHealthAlertConfig()
    ]);
    return ok({ runs: runs ?? [], config });
  } catch (e) {
    return mapApiError(e);
  }
}

/** Checar agora (não manda alerta: quem clicou já está vendo). */
export async function POST() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const tenantId = assertTenantScope(session);
    const r = await runHealthCheck(tenantId, "manual");
    return ok(r);
  } catch (e) {
    return mapApiError(e);
  }
}

/** Salva para onde vão os alertas. */
export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const tenantId = assertTenantScope(session);
    const c = cfgSchema.parse(await request.json());
    await saveHealthAlertConfig(c);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "health.alerts_config", entityType: "tenant", entityId: tenantId, metadata: { whatsapp: c.whatsapp, email: c.send_email, push: c.push }, request });
    return ok(c);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", "Dados inválidos", 400);
    return mapApiError(e);
  }
}
