import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const bodySchema = z.object({
  client_id: z.string().uuid().nullable()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id: profileId } = await params;
    const body = bodySchema.parse(await request.json());

    const { data: profile, error: profErr } = await db
      .from("profiles")
      .select("id, tenant_id, role, client_id")
      .eq("id", profileId)
      .maybeSingle();

    if (profErr || !profile) return fail("PROFILE_NOT_FOUND", "Perfil nao encontrado", 404);
    if (profile.tenant_id !== tenantId) return fail("FORBIDDEN", "Perfil fora do tenant", 403);

    if (body.client_id !== null) {
      if (profile.role !== "cliente") {
        return fail("INVALID_ROLE", "client_id so pode ser definido para perfis com papel cliente", 409);
      }
      const { data: clientRow, error: cErr } = await db
        .from("clients")
        .select("id")
        .eq("id", body.client_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (cErr || !clientRow) return fail("CLIENT_NOT_FOUND", "Cliente nao encontrado nesta organizacao", 404);
    }

    const { data: updated, error: updErr } = await db
      .from("profiles")
      .update({ client_id: body.client_id })
      .eq("id", profileId)
      .eq("tenant_id", tenantId)
      .select("id, client_id, role")
      .single();

    if (updErr || !updated) return fail("PROFILE_UPDATE_FAILED", updErr?.message ?? "Falha ao atualizar", 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "profile.client_scope_update",
      entityType: "profile",
      entityId: profileId,
      metadata: { before_client_id: profile.client_id, after_client_id: body.client_id },
      request
    });

    return ok(updated);
  } catch (error) {
    return mapApiError(error);
  }
}
