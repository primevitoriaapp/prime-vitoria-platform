import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const schema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["web", "android", "ios", "unknown"]).optional()
});

/**
 * Regista ou atualiza token FCM do motorista (PWA / app). Obrigatorio para push real na fila de notificacoes.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "location.write");

    if (session.role !== "motorista") {
      return fail("FORBIDDEN", "Apenas motorista pode registar token de push", 403);
    }
    if (!session.driverId) {
      return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);
    }

    const body = schema.parse(await request.json());
    const tenantId = assertTenantScope(session);
    const driverId = session.driverId;

    const { data: driver, error: dErr } = await db.from("drivers").select("id, tenant_id").eq("id", driverId).maybeSingle();
    if (dErr || !driver?.tenant_id) {
      return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);
    }
    if (driver.tenant_id !== tenantId) {
      return fail("FORBIDDEN", "Motorista fora do tenant da sessao", 403);
    }

    const platform = body.platform ?? "unknown";
    const { error } = await db.from("driver_push_tokens").upsert(
      {
        tenant_id: driver.tenant_id,
        driver_id: driver.id,
        token: body.token,
        platform,
        updated_at: new Date().toISOString()
      },
      { onConflict: "driver_id" }
    );

    if (error) return fail("PUSH_TOKEN_SAVE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.push_token_upsert",
      entityType: "driver",
      entityId: driver.id,
      metadata: { platform },
      request
    });

    return ok({ saved: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return fail("INVALID_REQUEST", message, 400);
  }
}
