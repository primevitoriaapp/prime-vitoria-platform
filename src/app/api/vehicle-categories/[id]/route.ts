import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  passengers: z.coerce.number().int().min(1).max(80).optional(),
  kind: z.enum(["carro", "van", "onibus"]).optional(),
  sort: z.coerce.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const { data, error } = await db.from("vehicle_categories").update(body).eq("id", id).eq("tenant_id", tenantId).select("*").single();
    if (error) return fail("CATEGORY_UPDATE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
