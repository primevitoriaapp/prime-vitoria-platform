import { db } from "@/lib/server/db";
import { clientCadastroSchema, normalizeClientPatch } from "@/lib/clients/client-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const patchSchema = clientCadastroSchema.partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const parsed = patchSchema.parse(await request.json());
    const updatePayload = normalizeClientPatch(parsed);

    if (Object.keys(updatePayload).length === 0) {
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
      .update(updatePayload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("CLIENT_UPDATE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: parsed.active === false ? "client.deactivate" : "client.update",
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
