import { db } from "@/lib/server/db";
import { getTenantCompanyProfile, upsertTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const BUCKET = "tenant-assets";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

function resolveImageMime(file: File): string | null {
  const mime = file.type?.trim();
  if (mime && ALLOWED.has(mime)) return mime;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const profile = await getTenantCompanyProfile(tenantId);
    const path = profile.logo_storage_path?.trim();
    if (!path) return fail("LOGO_NOT_FOUND", "Logo não configurado", 404);

    const { data, error } = await db.storage.from(BUCKET).download(path);
    if (error || !data) return fail("LOGO_LOAD_FAILED", error?.message ?? "Falha ao carregar logo", 500);

    const ext = path.split(".").pop()?.toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "svg"
            ? "image/svg+xml"
            : "image/jpeg";

    return new Response(data, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("INVALID_FILE", "Seleccione uma imagem.", 400);
    }
    if (file.size > MAX_BYTES) return fail("INVALID_FILE", "Imagem excede 5 MB.", 400);
    const mime = resolveImageMime(file);
    if (!mime) return fail("INVALID_FILE", "Formato não permitido.", 400);

    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/svg+xml"
            ? "svg"
            : "jpg";
    const path = `${tenantId}/logo/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: mime, upsert: true });
    if (error) return fail("LOGO_UPLOAD_FAILED", error.message, 500);

    await upsertTenantCompanyProfile(tenantId, { logo_storage_path: path });
    return ok({ storage_path: path }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
