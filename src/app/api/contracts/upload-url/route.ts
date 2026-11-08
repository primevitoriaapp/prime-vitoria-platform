import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const schema = z.object({ file_name: z.string().trim().min(1).max(200), size: z.number().int().positive().max(15 * 1024 * 1024) });

/** Link para o navegador mandar o PDF direto para o armazenamento (sem limite do servidor). */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const p = schema.safeParse(await request.json().catch(() => ({})));
    if (!p.success) return fail("VALIDATION_ERROR", "PDF de até 15 MB.", 400);
    const safe = p.data.file_name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-100);
    const path = `${tenantId}/${Date.now()}-${safe}`;
    const { data, error } = await db.storage.from("contracts").createSignedUploadUrl(path);
    if (error || !data) return fail("UPLOAD_URL_FAILED", "Não foi possível preparar o envio.", 500);
    return ok({ path, url: data.signedUrl });
  } catch (e) {
    return mapApiError(e);
  }
}
