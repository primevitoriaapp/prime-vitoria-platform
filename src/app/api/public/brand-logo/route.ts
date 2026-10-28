import { db } from "@/lib/server/db";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export const runtime = "nodejs";

/** Logo da Prime (cadastrada em Configurações) para telas sem login: entrar, portal, voucher. */
export async function GET() {
  try {
    const profile = await getTenantCompanyProfile(DEFAULT_TENANT_ID);
    const path = profile.logo_storage_path?.trim();
    if (!path) return new Response(null, { status: 404 });
    const { data, error } = await db.storage.from("tenant-assets").download(path);
    if (error || !data) return new Response(null, { status: 404 });
    const ext = path.split(".").pop()?.toLowerCase();
    const type =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
    return new Response(data, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
