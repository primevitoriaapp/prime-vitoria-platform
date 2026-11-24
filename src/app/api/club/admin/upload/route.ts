import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Logo/capa do parceiro (pública) ou contrato (privado, em "contracts"). Até 4 MB. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "imagem");
    if (!(file instanceof File)) return fail("VALIDATION", "Envie um arquivo", 400);
    const ext = TYPES[file.type];
    if (!ext) return fail("VALIDATION", "Use JPG, PNG, WEBP ou PDF", 400);
    if (file.size > 4 * 1024 * 1024) return fail("VALIDATION", "Arquivo acima de 4 MB", 400);
    const buf = Buffer.from(await file.arrayBuffer());
    if (kind === "contrato") {
      const path = `${tenantId}/prime-club/${randomUUID()}.${ext}`;
      const up = await db.storage.from("contracts").upload(path, buf, { contentType: file.type });
      if (up.error) return fail("UPLOAD_FAILED", up.error.message, 500);
      return ok({ path });
    }
    if (ext === "pdf") return fail("VALIDATION", "Para imagem, use JPG, PNG ou WEBP", 400);
    const path = `${tenantId}/${randomUUID()}.${ext}`;
    const up = await db.storage.from("club-media").upload(path, buf, { contentType: file.type, cacheControl: "31536000" });
    if (up.error) return fail("UPLOAD_FAILED", up.error.message, 500);
    return ok({ url: db.storage.from("club-media").getPublicUrl(path).data.publicUrl });
  } catch (e) {
    return mapApiError(e);
  }
}
