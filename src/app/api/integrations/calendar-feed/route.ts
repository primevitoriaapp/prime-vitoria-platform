import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getFeedToken, rotateFeedToken } from "@/lib/integrations/calendar-feed-store";

async function adminTenant() {
  const s = await getSessionContext();
  if (s.role !== "admin") return null;
  return s.tenantId ?? DEFAULT_TENANT_ID;
}

function feedUrl(request: Request, token: string) {
  return `${new URL(request.url).origin}/api/public/agenda/${token}.ics`;
}

/** Link da agenda para assinar (só o administrador vê). */
export async function GET(request: Request) {
  try {
    const tenantId = await adminTenant();
    if (!tenantId) return fail("FORBIDDEN", "Só o administrador.", 403);
    const token = await getFeedToken(tenantId);
    return ok({ url: token ? feedUrl(request, token) : null });
  } catch (e) {
    return mapApiError(e);
  }
}

/** Cria o link, ou troca por um novo (o antigo para de funcionar). */
export async function POST(request: Request) {
  try {
    const tenantId = await adminTenant();
    if (!tenantId) return fail("FORBIDDEN", "Só o administrador.", 403);
    const token = await rotateFeedToken(tenantId);
    return ok({ url: feedUrl(request, token) });
  } catch (e) {
    return mapApiError(e);
  }
}
