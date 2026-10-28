import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { categoryPhotoUrl, listVehicleCategories } from "@/lib/pricing/vehicle-categories";

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).nullable().optional(),
  passengers: z.coerce.number().int().min(1).max(80),
  kind: z.enum(["carro", "van", "onibus"]),
  sort: z.coerce.number().int().min(0).max(9999).optional()
});

export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role === "guest") return fail("FORBIDDEN", "Sessão inválida", 403);
    const tenantId = assertTenantScope(session);
    const staff = session.role === "admin" || session.role === "operador";
    const rows = await listVehicleCategories(tenantId, staff);
    return ok(rows.map((c) => ({ ...c, photo_url: categoryPhotoUrl(c) })));
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const body = createSchema.parse(await request.json());
    const { data, error } = await db
      .from("vehicle_categories")
      .insert({ tenant_id: tenantId, ...body, description: body.description ?? null, sort: body.sort ?? 100 })
      .select("*")
      .single();
    if (error) return fail("CATEGORY_CREATE_FAILED", error.message, 500);
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
