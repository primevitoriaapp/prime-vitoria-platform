import { z } from "zod";
import {
  listDriverPayoutRules,
  upsertDriverPayoutRulesBatch,
  type DriverPayoutRuleInput
} from "@/lib/drivers/driver-payout-rules";
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
  active: z.boolean().optional()
});

const putSchema = z.object({
  rules: z.array(ruleSchema).min(1)
});

async function assertDriver(id: string, tenantId: string) {
  const { data } = await db.from("drivers").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    if (!(await assertDriver(id, tenantId))) {
      return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);
    }
    const rules = await listDriverPayoutRules(id, tenantId);
    return ok(rules);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    if (!(await assertDriver(id, tenantId))) {
      return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);
    }

    const { rules } = putSchema.parse(await request.json());
    const { data, error } = await upsertDriverPayoutRulesBatch(id, tenantId, rules as DriverPayoutRuleInput[]);
    if (error) {
      if (/driver_payout_rules/i.test(error.message)) {
        return fail("PAYOUT_SCHEMA_MISSING", error.message, 503, "Aplique migration 0051 no Supabase.");
      }
      return fail("PAYOUT_RULES_SAVE_FAILED", error.message, 500);
    }
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
