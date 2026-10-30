import { db } from "@/lib/server/db";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

/** Logo da Prime como data URL (para gerar o ícone do app). Null se não houver PNG/JPG cadastrado. */
export async function brandLogoDataUrl(): Promise<string | null> {
  try {
    const profile = await getTenantCompanyProfile(DEFAULT_TENANT_ID);
    const path = profile.logo_storage_path?.trim();
    if (!path) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    if (!ext || !["png", "jpg", "jpeg"].includes(ext)) return null;
    const { data } = await db.storage.from("tenant-assets").download(path);
    if (!data) return null;
    const b64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    return `data:image/${ext === "png" ? "png" : "jpeg"};base64,${b64}`;
  } catch {
    return null;
  }
}
