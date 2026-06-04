import { insertClientRow, updateClientRow } from "@/lib/clients/client-db";
import { clientCadastroSchema, normalizeClientBody } from "@/lib/clients/client-cadastro-schema";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { mapSupabaseError } from "@/lib/server/supabase-errors";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const parsed = clientCadastroSchema.parse(await request.json());
    const body = normalizeClientBody(parsed);

    const { data, error, partialSave, warning } = await insertClientRow(body, tenantId);
    if (error || !data) {
      const mapped = mapSupabaseError(error!, "cliente");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "client.create",
      entityType: "client",
      entityId: String(data.id),
      metadata: { name: body.name, type: body.type, partialSave: partialSave ?? false },
      request
    });

    const apiWarning =
      warning ??
      (partialSave
        ? "Cliente guardado com dados essenciais. Aplique migrations 0044/0046 no Supabase para campos completos."
        : undefined);

    return ok({ ...data, ...(apiWarning ? { _warning: apiWarning } : {}) }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const { data, error } = await db
      .from("clients")
      .select("*")
      .eq("active", true)
      .eq("tenant_id", tenantId)
      .order("name")
      .limit(200);
    if (error) {
      const mapped = mapSupabaseError(error, "listagem de clientes");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}
