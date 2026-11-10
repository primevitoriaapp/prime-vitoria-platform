import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { DRIVER_DOC_KIND_SET } from "@/lib/drivers/driver-document-kinds";

const schema = z.object({ kind: z.string(), file_name: z.string().trim().min(1).max(200), size: z.number().int().positive().max(20 * 1024 * 1024) });

/** Link para o navegador mandar o arquivo direto ao armazenamento privado. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const p = schema.safeParse(await request.json().catch(() => ({})));
    if (!p.success || !DRIVER_DOC_KIND_SET.has(p.data.kind)) return fail("VALIDATION_ERROR", "Arquivo de até 20 MB.", 400);
    const { data: d } = await db.from("drivers").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!d) return fail("NOT_FOUND", "Motorista não encontrado", 404);
    const ext = (p.data.file_name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${tenantId}/${id}/docs/${p.data.kind}-${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from("driver-docs").createSignedUploadUrl(path);
    if (error || !data) return fail("UPLOAD_URL_FAILED", "Não foi possível preparar o envio.", 500);
    return ok({ path, url: data.signedUrl });
  } catch (e) {
    return mapApiError(e);
  }
}
