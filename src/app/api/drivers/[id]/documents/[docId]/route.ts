import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Atualiza a validade de um documento. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id, docId } = await params;
    const b = z.object({ valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).parse(await request.json());
    const { error } = await db.from("driver_documents").update({ valid_until: b.valid_until }).eq("id", docId).eq("driver_id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    return ok({ saved: true });
  } catch (e) {
    return mapApiError(e);
  }
}
