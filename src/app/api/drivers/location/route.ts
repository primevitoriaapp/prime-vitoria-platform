import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { validateDriverLocation } from "@/lib/location/tracking";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const schema = z.object({
  driver_id: z.string().uuid().optional(),
  trip_id: z.string().uuid().optional(),
  lat: z.number(),
  lng: z.number(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  recorded_at: z.string()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "location.write");

    const body = schema.parse(await request.json());

    let driverId = body.driver_id;
    if (session.role === "motorista") {
      if (!session.driverId) {
        return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);
      }
      driverId = session.driverId;
    }
    if (!driverId) {
      return fail("VALIDATION", "driver_id e obrigatorio para este papel", 400);
    }

    const tenantId = assertTenantScope(session);

    const { data: driver, error: driverErr } = await db.from("drivers").select("tenant_id").eq("id", driverId).maybeSingle();
    if (driverErr || !driver?.tenant_id) {
      return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);
    }
    if (driver.tenant_id !== tenantId) {
      return fail("FORBIDDEN", "Motorista fora do tenant da sessao", 403);
    }

    const payload = { ...body, driver_id: driverId };
    try {
      validateDriverLocation(payload);
    } catch (error) {
      return fail("INVALID_LOCATION", error instanceof Error ? error.message : "Invalid location", 400);
    }

    const { error } = await db.from("driver_locations").insert({
      driver_id: driverId,
      trip_id: body.trip_id,
      lat: body.lat,
      lng: body.lng,
      speed: body.speed,
      heading: body.heading,
      recorded_at: body.recorded_at,
      tenant_id: driver.tenant_id
    });
    if (error) return fail("DRIVER_LOCATION_FAILED", error.message, 500);

    return ok({ saved: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return fail("INVALID_REQUEST", message, 400);
  }
}
