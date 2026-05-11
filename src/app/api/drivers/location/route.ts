import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { validateDriverLocation } from "@/lib/location/tracking";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

const schema = z.object({
  driver_id: z.string().uuid(),
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

    if (session.role === "motorista") {
      if (!session.driverId || session.driverId !== body.driver_id) {
        return fail("FORBIDDEN", "Motorista so pode enviar localizacao do proprio cadastro", 403);
      }
    }

    try {
      validateDriverLocation(body);
    } catch (error) {
      return fail("INVALID_LOCATION", error instanceof Error ? error.message : "Invalid location", 400);
    }

    const { error } = await db.from("driver_locations").insert(body);
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
