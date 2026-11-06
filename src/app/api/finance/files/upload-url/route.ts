import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { FINANCE_ENTITY_TYPES } from "@/lib/finance/finance-files";

const schema = z.object({
  entity_type: z.enum(FINANCE_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(25 * 1024 * 1024)
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("VALIDATION_ERROR", "Arquivo inválido (máximo 25 MB).", 400);
    const safe = parsed.data.file_name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-120);
    const path = `${tenantId}/financeiro/${parsed.data.entity_type}/${parsed.data.entity_id}/${Date.now()}-${safe}`;
    const { data, error } = await db.storage.from("archive-files").createSignedUploadUrl(path);
    if (error || !data) return fail("UPLOAD_URL_FAILED", "Não foi possível preparar o envio.", 500);
    return ok({ path, url: data.signedUrl });
  } catch (e) {
    return mapApiError(e);
  }
}
