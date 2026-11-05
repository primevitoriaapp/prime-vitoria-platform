import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { ARCHIVE_CATEGORIES } from "@/lib/archive/archive-categories";

const schema = z.object({
  file_name: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(100 * 1024 * 1024),
  category: z.enum(Object.keys(ARCHIVE_CATEGORIES) as [string, ...string[]])
});

/** Link de envio direto para o armazenamento (arquivos grandes não passam pelo servidor). */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("VALIDATION_ERROR", "Arquivo inválido (máximo 100 MB).", 400);
    const safe = parsed.data.file_name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-120);
    const path = `${tenantId}/${parsed.data.category}/${Date.now()}-${safe}`;
    const { data, error } = await db.storage.from("archive-files").createSignedUploadUrl(path);
    if (error || !data) return fail("UPLOAD_URL_FAILED", "Não foi possível preparar o envio.", 500);
    return ok({ path, url: data.signedUrl });
  } catch (e) {
    return mapApiError(e);
  }
}
