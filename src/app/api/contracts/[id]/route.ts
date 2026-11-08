import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Cancelar (some do app/portal como pendente) ou anotar. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = z.object({ status: z.enum(["cancelado"]).optional(), notes: z.string().max(500).optional() }).parse(await request.json());
    const { error } = await db.from("contracts").update(b).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    return ok({ saved: true });
  } catch (e) {
    return mapApiError(e);
  }
}
