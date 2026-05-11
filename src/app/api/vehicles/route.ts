import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";

const schema = z.object({
  model: z.string().min(2),
  plate: z.string().min(7),
  category: z.string().optional(),
  capacity: z.number().int().optional(),
  color: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "vehicle.write");
    const body = schema.parse(await request.json());
    const { data, error } = await db.from("vehicles").insert(body).select("*").single();
    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("VEHICLE_PLATE_CONFLICT", "Ja existe veiculo com esta placa", 409);
      }
      return fail("VEHICLE_CREATE_FAILED", error.message, 500);
    }
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "vehicle.read");
    const { data, error } = await db.from("vehicles").select("*").eq("active", true).limit(200);
    if (error) return fail("VEHICLE_LIST_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}
