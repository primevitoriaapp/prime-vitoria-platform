import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { clubDriver } from "@/lib/club/driver-session";

const schema = z.object({ redemption_id: z.string().uuid(), rating: z.number().int().min(1).max(5) });

/** O motorista avalia o atendimento de um uso registrado. */
export async function POST(request: Request) {
  try {
    const { driver, denied } = await clubDriver();
    if (denied || !driver) return denied as Response;
    const { redemption_id, rating } = schema.parse(await request.json());
    const { data, error } = await db.from("club_redemptions").update({ rating }).eq("id", redemption_id).eq("driver_id", driver.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return fail("NOT_FOUND", "Uso não encontrado", 404);
    return ok({ rating });
  } catch (e) {
    return mapApiError(e);
  }
}
