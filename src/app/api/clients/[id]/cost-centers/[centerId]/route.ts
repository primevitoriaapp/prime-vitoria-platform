import { z } from "zod";
import { updateCostCenter } from "@/lib/clients/client-cost-centers";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().optional().nullable(),
  responsible_name: z.string().optional().nullable(),
  responsible_email: z.string().email().optional().nullable().or(z.literal("")),
  active: z.boolean().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; centerId: string }> }
) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id, centerId } = await params;
    const { data: clientRow } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!clientRow) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const body = patchSchema.parse(await request.json());
    const { data, error } = await updateCostCenter(centerId, id, body);
    if (error) return fail("COST_CENTER_UPDATE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
