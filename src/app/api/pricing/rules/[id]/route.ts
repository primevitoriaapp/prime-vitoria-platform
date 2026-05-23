import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { pricingRulePatchSchema } from "@/lib/pricing/pricing-rule-schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = pricingRulePatchSchema.parse(await request.json());

    const { data: existing } = await db
      .from("pricing_rules")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("PRICING_RULE_NOT_FOUND", "Regra não encontrada", 404);

    const { data, error } = await db
      .from("pricing_rules")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("PRICING_RULE_UPDATE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "pricing_rule.update",
      entityType: "pricing_rule",
      entityId: id,
      metadata: body,
      request
    });

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}

/** Desactiva regra (soft delete operacional). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data, error } = await db
      .from("pricing_rules")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();

    if (error) return fail("PRICING_RULE_DELETE_FAILED", error.message, 500);
    if (!data) return fail("PRICING_RULE_NOT_FOUND", "Regra não encontrada", 404);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "pricing_rule.deactivate",
      entityType: "pricing_rule",
      entityId: id,
      metadata: {},
      request
    });

    return ok({ id, active: false });
  } catch (error) {
    return mapApiError(error);
  }
}
