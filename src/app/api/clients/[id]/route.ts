import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const patchSchema = z.object({
  type: z.enum(["PF", "PJ"]).optional(),
  name: z.string().min(2).optional(),
  document: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  active: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    if (Object.keys(body).length === 0) {
      return fail("INVALID_BODY", "Nenhum campo para actualizar", 400);
    }

    const { data: existing } = await db
      .from("clients")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("CLIENT_NOT_FOUND", "Cliente nao encontrado", 404);

    const { data, error } = await db
      .from("clients")
      .update(body)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("CLIENT_UPDATE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: body.active === false ? "client.deactivate" : "client.update",
      entityType: "client",
      entityId: id,
      metadata: { name: data.name, type: data.type },
      request
    });

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
