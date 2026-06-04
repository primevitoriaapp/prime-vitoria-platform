import { z } from "zod";
import { getClientPricingConfig, upsertClientPricingConfig } from "@/lib/clients/client-pricing-db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const bodySchema = z.object({
  service_type: z.string().min(1).max(64).optional(),
  charge_type: z.enum(["per_km", "fixed", "daily", "hourly"]),
  price_per_km: z.coerce.number().nonnegative().optional().nullable(),
  min_km: z.coerce.number().nonnegative().optional().nullable(),
  wait_tolerance_minutes: z.coerce.number().int().nonnegative().optional().nullable(),
  wait_price_per_hour: z.coerce.number().nonnegative().optional().nullable(),
  fixed_price: z.coerce.number().nonnegative().optional().nullable()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: client } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!client) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const config = await getClientPricingConfig(id, tenantId);
    return ok(config);
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
    const body = bodySchema.parse(await request.json());

    const { data: client } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!client) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const { data, error } = await upsertClientPricingConfig(id, tenantId, body);
    if (error) {
      if (/client_pricing_rules|relation/i.test(error.message)) {
        return fail(
          "PRICING_SCHEMA_MISSING",
          "Tabela client_pricing_rules não encontrada.",
          503,
          "Aplique migration 0049 no Supabase (npm run db:apply-p1-staging)."
        );
      }
      return fail("PRICING_CONFIG_SAVE_FAILED", error.message, 500);
    }

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
