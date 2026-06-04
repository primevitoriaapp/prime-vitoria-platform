import { updateClientRow } from "@/lib/clients/client-db";
import { clientCadastroSchema, normalizeClientPatch } from "@/lib/clients/client-cadastro-schema";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { mapSupabaseError } from "@/lib/server/supabase-errors";

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

    const { data, error, partialSave } = await updateClientRow(id, tenantId, updatePayload);
    if (error || !data) {
      const mapped = mapSupabaseError(error!, "cliente");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: parsed.active === false ? "client.deactivate" : "client.update",
      entityType: "client",
      entityId: id,
      metadata: { name: data.name, type: data.type, partialSave: partialSave ?? false },
      request
    });

    const warning = partialSave
      ? "Actualizado parcialmente — campos extra exigem migration 0044 no Supabase."
      : undefined;

    return ok({ ...data, ...(warning ? { _warning: warning } : {}) });
  } catch (error) {
    return mapApiError(error);
  }
}
