import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { zapsignTemplateVariables } from "@/lib/integrations/zapsign";
import { fillTemplate } from "@/lib/contracts/template-fill";
import { fillSourceFor } from "@/lib/contracts/fill-source";

/** Variáveis do modelo já preenchidas com o cadastro do motorista/cliente (para conferir antes de enviar). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { token } = await params;
    const u = new URL(request.url);
    const { name, variables } = await zapsignTemplateVariables(token);
    const src = await fillSourceFor(tenantId, { driverId: u.searchParams.get("driver_id"), clientId: u.searchParams.get("client_id") });
    return ok({ name, fields: fillTemplate(variables, src) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("ZapSign")) return fail("ZAPSIGN_ERROR", e.message, 502);
    return mapApiError(e);
  }
}
