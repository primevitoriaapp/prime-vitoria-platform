import { PROFILE_FIELDS } from "@/lib/drivers/change-request-rules";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Pedidos dos motoristas aguardando a central (veículo, CNH, PIX). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { data } = await db.from("driver_change_requests").select("*").eq("tenant_id", tenantId).eq("status", "pendente").order("created_at").limit(50);
    const ids = [...new Set((data ?? []).map((r) => r.driver_id as string))];
    const { data: drivers } = ids.length ? await db.from("drivers").select(`id, full_name, cnh_number, cnh_category, cnh_expires_at, pix_key, ${PROFILE_FIELDS.map((f) => f.key).filter((k) => k !== "full_name").join(", ")}` as "*").in("id", ids) : { data: [] };
    const byId = new Map((drivers ?? []).map((d) => [d.id as string, d]));
    const catIds = (data ?? []).map((r) => (r.payload as Record<string, unknown>)?.vehicle_category_id as string).filter(Boolean);
    const { data: cats } = catIds.length ? await db.from("vehicle_categories").select("id, name").in("id", catIds) : { data: [] };
    const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
    const items = await Promise.all(
      (data ?? []).map(async (r) => {
        let file_url: string | null = null;
        if (r.file_path) file_url = (await db.storage.from("driver-docs").createSignedUrl(r.file_path as string, 900)).data?.signedUrl ?? null;
        const p = r.payload as Record<string, unknown>;
        return { ...r, file_url, driver: byId.get(r.driver_id as string) ?? null, category_name: p?.vehicle_category_id ? catName.get(p.vehicle_category_id as string) ?? null : null };
      })
    );
    return ok({ items });
  } catch (error) {
    return mapApiError(error);
  }
}
