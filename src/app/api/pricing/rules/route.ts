import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { pricingRuleBodySchema, pricingRulesListSchema } from "@/lib/pricing/pricing-rule-schema";

/** Lista regras de precificação do tenant (filtro opcional por cliente). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.read");
    const tenantId = assertTenantScope(session);
    const q = pricingRulesListSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("pricing_rules")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q.client_id) query = query.eq("client_id", q.client_id);
    if (q.active !== undefined) query = query.eq("active", q.active);

    const { data, error, count } = await query;
    if (error) return fail("PRICING_RULES_LIST_FAILED", error.message, 500);

    return ok({ items: data ?? [], page: q.page, pageSize: q.pageSize, total: count ?? 0 });
  } catch (error) {
    return mapApiError(error);
  }
}

/** Cria regra de precificação para um cliente. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const body = pricingRuleBodySchema.parse(await request.json());

    const { data: client } = await db
      .from("clients")
      .select("id")
      .eq("id", body.client_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!client) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado neste tenant", 404);

    const row = {
      tenant_id: tenantId,
      client_id: body.client_id,
      name: body.name,
      calculation_type: body.calculation_type,
      active: body.active,
      priority: body.priority,
      fixed_price: body.fixed_price ?? null,
      price_per_km: body.price_per_km ?? null,
      minimum_km: body.minimum_km ?? null,
      minimum_value: body.minimum_value ?? null,
      included_hours: body.included_hours ?? null,
      extra_hour_value: body.extra_hour_value ?? null,
      included_km: body.included_km ?? null,
      extra_km_value: body.extra_km_value ?? null,
      night_fee: body.night_fee ?? null,
      holiday_fee: body.holiday_fee ?? null,
      toll_policy: body.toll_policy ?? null,
      parking_policy: body.parking_policy ?? null,
      settings: body.settings ?? {},
      updated_at: new Date().toISOString()
    };

    const { data, error } = await db.from("pricing_rules").insert(row).select("*").single();
    if (error) return fail("PRICING_RULE_CREATE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "pricing_rule.create",
      entityType: "pricing_rule",
      entityId: data.id,
      metadata: { client_id: body.client_id, calculation_type: body.calculation_type },
      request
    });

    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
