import { z } from "zod";
import { getClientBillingTerms, updateClientBillingTerms } from "@/lib/clients/client-billing-terms";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const money = z.coerce.number().nonnegative().max(100000).nullable();

const bodySchema = z.object({
  wait_tolerance_minutes: z.coerce.number().int().min(0).max(240),
  wait_client_price_per_hour: money,
  wait_driver_price_per_hour: money,
  payment_term_days: z.coerce.number().int().min(0).max(180).nullable(),
  billing_issuer: z.enum(["rj_prime", "prime_servicos", "ilha_prime"]).nullable()
});

async function clientExists(id: string, tenantId: string): Promise<boolean> {
  const { data } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    if (!(await clientExists(id, tenantId))) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
    return ok(await getClientBillingTerms(id, tenantId));
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
    if (!(await clientExists(id, tenantId))) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
    const body = bodySchema.parse(await request.json());
    const { data, error } = await updateClientBillingTerms(id, tenantId, body);
    if (error) return fail("BILLING_TERMS_SAVE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
