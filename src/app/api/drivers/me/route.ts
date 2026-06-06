import { db } from "@/lib/server/db";
import { driverRowToApiShape } from "@/lib/drivers/driver-supabase-row";
import { attachProfileNamesToDrivers } from "@/lib/vehicles/driver-default-vehicle";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { resolveDriverPhotoDisplayUrl } from "@/lib/storage/driver-photo-upload";

/** Perfil do motorista autenticado (app /driver). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "motorista") {
      return fail("FORBIDDEN", "Apenas motoristas podem aceder ao perfil próprio", 403);
    }
    if (!session.driverId) {
      return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado", 403);
    }

    const tenantId = assertTenantScope(session);
    const { data: driver, error } = await db
      .from("drivers")
      .select("*")
      .eq("id", session.driverId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) return fail("DRIVER_PROFILE_FAILED", error.message, 500);
    if (!driver) return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);

    const [withProfile] = await attachProfileNamesToDrivers([driver]);
    const photo_url = await resolveDriverPhotoDisplayUrl(driver.photo_url as string | null);
    const shaped = driverRowToApiShape(withProfile as Record<string, unknown>);

    return ok({
      id: shaped.id,
      cpf: shaped.cpf,
      profile_name: shaped.profile_name ?? shaped.full_name ?? null,
      full_name: shaped.full_name ?? null,
      photo_url
    });
  } catch (error) {
    return mapApiError(error);
  }
}
