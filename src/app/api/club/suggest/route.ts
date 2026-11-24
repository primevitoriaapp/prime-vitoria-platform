import { z } from "zod";
import { db } from "@/lib/server/db";
import { mapApiError, ok } from "@/lib/server/http";
import { clubDriver } from "@/lib/club/driver-session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  company: z.string().trim().min(2).max(120),
  category: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  contact: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable()
});

/** O motorista indica um estabelecimento: entra no Hunter como "Prospectado". */
export async function POST(request: Request) {
  try {
    const { driver, denied } = await clubDriver();
    if (denied || !driver) return denied as Response;
    enforceRateLimit(`club-suggest:${driver.id}`, 10, 24 * 60 * 60_000);
    const b = schema.parse(await request.json());
    const { error } = await db.from("club_prospects").insert({
      tenant_id: driver.tenantId,
      company: b.company,
      category: b.category || null,
      city: b.city || null,
      contact_name: b.contact || null,
      phone: b.phone || null,
      notes: [`Indicado por ${driver.full_name} pelo app.`, b.notes].filter(Boolean).join("\n"),
      stage: "prospectado",
      suggested_by_driver: driver.id
    });
    if (error) throw error;
    return ok({ sent: true });
  } catch (e) {
    return mapApiError(e);
  }
}
