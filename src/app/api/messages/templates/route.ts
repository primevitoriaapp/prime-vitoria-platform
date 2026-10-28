import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { loadEffectiveTemplates, restoreDefaultTemplate, saveTemplate } from "@/lib/messages/template-db";
import { MESSAGE_EVENTS } from "@/lib/messages/templates";

const EVENT_IDS = MESSAGE_EVENTS.map((e) => e.id) as [string, ...string[]];
const scopeSchema = z.object({
  event: z.enum(EVENT_IDS),
  audience: z.enum(["passageiro", "solicitante", "motorista", "operador"]),
  client_id: z.string().uuid().nullable().optional()
});
const putSchema = scopeSchema.extend({ body: z.string().trim().min(3).max(2000) });

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const clientId = new URL(request.url).searchParams.get("client_id");
    const parsed = clientId ? z.string().uuid().safeParse(clientId) : null;
    if (parsed && !parsed.success) return fail("INVALID_CLIENT", "Cliente inválido", 400);
    return ok(await loadEffectiveTemplates(tenantId, clientId || null));
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const body = putSchema.parse(await request.json());
    const err = await saveTemplate(tenantId, body as Parameters<typeof saveTemplate>[1]);
    if (err) return fail("TEMPLATE_SAVE_FAILED", err.message, 500);
    return ok({ saved: true });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const body = scopeSchema.parse(await request.json());
    const err = await restoreDefaultTemplate(tenantId, body as Parameters<typeof restoreDefaultTemplate>[1]);
    if (err) return fail("TEMPLATE_RESTORE_FAILED", err.message, 500);
    return ok({ restored: true });
  } catch (error) {
    return mapApiError(error);
  }
}
