import { z } from "zod";
import { db } from "@/lib/server/db";
import { mapApiError, ok } from "@/lib/server/http";
import { clubDriver } from "@/lib/club/driver-session";

const schema = z.object({ partner_id: z.string().uuid(), on: z.boolean() });

/** Marca ou desmarca um estabelecimento como favorito. */
export async function POST(request: Request) {
  try {
    const { driver, denied } = await clubDriver();
    if (denied || !driver) return denied as Response;
    const { partner_id, on } = schema.parse(await request.json());
    if (on) await db.from("club_favorites").upsert({ driver_id: driver.id, partner_id }, { onConflict: "driver_id,partner_id" });
    else await db.from("club_favorites").delete().eq("driver_id", driver.id).eq("partner_id", partner_id);
    return ok({ on });
  } catch (e) {
    return mapApiError(e);
  }
}
