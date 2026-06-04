import { z } from "zod";
import {
  listClientPricingRules,
  upsertClientPricingRulesBatch,
  type ClientPricingRuleInput
} from "@/lib/clients/client-pricing-rules";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const ruleSchema = z.object({
  service_type: z.string().min(1),
  charge_type: z.enum(["per_km", "fixed", "daily", "hourly"]),
  price_per_km: z.coerce.number().nonnegative().optional().nullable(),
  min_km: z.coerce.number().nonnegative().optional().nullable(),
  fixed_price: z.coerce.number().nonnegative().optional().nullable(),
  driver_price_per_km: z.coerce.number().nonnegative().optional().nullable(),
  driver_min_km: z.coerce.number().nonnegative().optional().nullable(),
  driver_fixed_price: z.coerce.number().nonnegative().optional().nullable(),
  active: z.boolean().optional()
});

const putSchema = z.object({
  rules: z.array(ruleSchema).min(1)
});

async function assertClient(id: string, tenantId: string) {
  const { data } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    if (!(await assertClient(id, tenantId))) {
      return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
    }
    const rules = await listClientPricingRules(id, tenantId);
    return ok(rules);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    if (!(await assertClient(id, tenantId))) {
      return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
    }

    const { rules } = putSchema.parse(await request.json());
    const { data, error } = await upsertClientPricingRulesBatch(id, tenantId, rules as ClientPricingRuleInput[]);
    if (error) {
      if (/client_pricing_rules|driver_/i.test(error.message)) {
        return fail(
          "PRICING_SCHEMA_MISSING",
          error.message,
          503,
          "Aplique migration 0051 no Supabase."
        );
      }
      return fail("PRICING_RULES_SAVE_FAILED", error.message, 500);
    }
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
