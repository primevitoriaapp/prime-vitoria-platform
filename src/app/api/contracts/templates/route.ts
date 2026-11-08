import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { zapsignListTemplates } from "@/lib/integrations/zapsign";

export async function GET() {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    return ok(await zapsignListTemplates());
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("ZapSign")) return fail("ZAPSIGN_ERROR", e.message, 502);
    return mapApiError(e);
  }
}
