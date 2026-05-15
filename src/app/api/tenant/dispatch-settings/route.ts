import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { loadDispatchAutomationSettings } from "@/lib/dispatch/auto-offer-after-approve";

const putSchema = z
  .object({
    auto_offer_on_approve: z.boolean(),
    auto_direct_assign_on_approve: z.boolean(),
    offer_expires_seconds: z.number().int().min(30).max(3600),
    max_offer_candidates: z.number().int().min(1).max(50),
    require_operational_claim: z.boolean()
  })
  .superRefine((val, ctx) => {
    if (val.auto_offer_on_approve && val.auto_direct_assign_on_approve) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Escolha oferta automática ou despacho direto automático, não ambos."
      });
    }
  });

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const tenantId = assertTenantScope(session);
    const settings = await loadDispatchAutomationSettings(tenantId);
    return ok({ tenant_id: tenantId, ...settings });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const tenantId = assertTenantScope(session);
    const body = putSchema.parse(await request.json());

    const { error } = await db.from("dispatch_automation_settings").upsert(
      {
        tenant_id: tenantId,
        auto_offer_on_approve: body.auto_offer_on_approve,
        auto_direct_assign_on_approve: body.auto_direct_assign_on_approve,
        offer_expires_seconds: body.offer_expires_seconds,
        max_offer_candidates: body.max_offer_candidates,
        require_operational_claim: body.require_operational_claim,
        updated_at: new Date().toISOString(),
        updated_by: session.userId
      },
      { onConflict: "tenant_id" }
    );

    if (error) return fail("DISPATCH_SETTINGS_SAVE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "tenant.dispatch_settings_update",
      entityType: "dispatch_automation_settings",
      entityId: tenantId,
      metadata: body,
      request
    });

    const settings = await loadDispatchAutomationSettings(tenantId);
    return ok({ tenant_id: tenantId, ...settings });
  } catch (error) {
    return mapApiError(error);
  }
}
