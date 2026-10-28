import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { getVehicleCategory } from "@/lib/pricing/vehicle-categories";

export const runtime = "nodejs";

const ALLOWED: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 3 * 1024 * 1024;

/** Foto/desenho da categoria (PNG, JPG ou WEBP até 3 MB). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const cat = await getVehicleCategory(tenantId, id);
    if (!cat) return fail("CATEGORY_NOT_FOUND", "Categoria não encontrada", 404);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("NO_FILE", "Envie uma imagem", 400);
    const ext = ALLOWED[file.type] ?? (file.name.toLowerCase().endsWith(".png") ? "png" : file.name.toLowerCase().match(/\.jpe?g$/) ? "jpg" : null);
    if (!ext) return fail("INVALID_TYPE", "Use PNG, JPG ou WEBP", 400);
    if (file.size > MAX_BYTES) return fail("TOO_BIG", "Imagem maior que 3 MB", 400);

    const path = `${tenantId}/categories/${id}-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage
      .from("tenant-assets")
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || `image/${ext}`, upsert: true });
    if (upErr) return fail("UPLOAD_FAILED", upErr.message, 500);

    if (cat.photo_path) await db.storage.from("tenant-assets").remove([cat.photo_path]).catch(() => undefined);
    const { data, error } = await db.from("vehicle_categories").update({ photo_path: path }).eq("id", id).select("*").single();
    if (error) return fail("CATEGORY_UPDATE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
