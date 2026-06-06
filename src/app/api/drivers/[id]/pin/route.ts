import { z } from "zod";
import { hashDriverPin, isValidDriverPin } from "@/lib/auth/driver-pin-crypto";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "PIN deve ter exatamente 4 dígitos.")
    .nullable()
    .optional()
});

/** Define ou remove o PIN de acesso do motorista em /driver/login. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { pin } = bodySchema.parse(await request.json());

    const { data: existing, error: loadErr } = await db
      .from("drivers")
      .select("id, cpf, full_name")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (loadErr) return fail("DRIVER_LOAD_FAILED", loadErr.message, 500);
    if (!existing) return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);

    const now = new Date().toISOString();
    const updateRow =
      pin === null || pin === undefined
        ? { pin_hash: null, pin_set_at: null }
        : {
            pin_hash: hashDriverPin(pin),
            pin_set_at: now
          };

    if (pin !== null && pin !== undefined && !isValidDriverPin(pin)) {
      return fail("INVALID_PIN", "PIN deve ter exatamente 4 dígitos.", 400);
    }

    const { error } = await db.from("drivers").update(updateRow).eq("id", id).eq("tenant_id", tenantId);
    if (error) {
      if (/pin_hash|column/i.test(error.message)) {
        return fail(
          "DRIVER_SCHEMA_OUTDATED",
          "Coluna pin_hash ausente. Aplique a migration 0061 no Supabase.",
          503
        );
      }
      return fail("PIN_UPDATE_FAILED", error.message, 500);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: pin ? "driver.pin_set" : "driver.pin_cleared",
      entityType: "driver",
      entityId: id,
      metadata: { cpf: existing.cpf },
      request
    });

    return ok({ has_pin: Boolean(pin), pin_set_at: pin ? now : null });
  } catch (error) {
    return mapApiError(error);
  }
}
