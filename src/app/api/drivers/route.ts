import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";

const schema = z.object({
  profile_id: z.string().uuid(),
  cpf: z.string().min(11),
  cnh_number: z.string().optional(),
  cnh_category: z.string().optional(),
  cnh_expiry: z.string().optional(),
  pix_key: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");

    const body = schema.parse(await request.json());
    const { data, error } = await db.from("drivers").insert(body).select("*").single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("DRIVER_PROFILE_CONFLICT", "Ja existe motorista vinculado a este perfil", 409);
      }
      return fail("DRIVER_CREATE_FAILED", error.message, 500);
    }
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const { data, error } = await db.from("drivers").select("*").eq("active", true).limit(200);
    if (error) return fail("DRIVER_LIST_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}
