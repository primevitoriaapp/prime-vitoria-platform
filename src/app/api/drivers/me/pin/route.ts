import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { hashDriverPin, verifyDriverPin } from "@/lib/auth/driver-pin-crypto";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  current: z.string().regex(/^\d{4}$/, "PIN atual tem 4 dígitos"),
  next: z.string().regex(/^\d{4}$/, "O novo PIN precisa ter 4 dígitos")
});

/** O próprio motorista troca o PIN dele (precisa informar o atual). */
export async function POST(request: Request) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só o motorista troca o próprio PIN", 403);
    const tenantId = assertTenantScope(session);
    const b = bodySchema.parse(await request.json());
    if (b.current === b.next) return fail("SAME_PIN", "O novo PIN precisa ser diferente do atual.", 400);
    if (/^(\d)\1{3}$/.test(b.next) || ["1234", "4321", "0123"].includes(b.next)) return fail("WEAK_PIN", "Escolha um PIN menos óbvio (evite 1111 ou 1234).", 400);
    const { data: d } = await db.from("drivers").select("pin_hash").eq("id", session.driverId).eq("tenant_id", tenantId).maybeSingle();
    if (!d || !verifyDriverPin(b.current, d.pin_hash as string | null)) return fail("WRONG_PIN", "PIN atual incorreto.", 400);
    const { error } = await db.from("drivers").update({ pin_hash: hashDriverPin(b.next), pin_set_at: new Date().toISOString() }).eq("id", session.driverId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "driver.pin_self_change", entityType: "driver", entityId: session.driverId, metadata: {}, request });
    return ok({ changed: true });
  } catch (error) {
    return mapApiError(error);
  }
}
