import { insertClientRow, listActiveClientsForTenant } from "@/lib/clients/client-db";
import { db } from "@/lib/server/db";
import { clientCadastroSchema, normalizeClientBody } from "@/lib/clients/client-cadastro-schema";
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
        ? "Cliente salvo com dados essenciais. Aplique migrations 0044/0046 no Supabase para campos completos."
        : undefined);

    return ok({ ...data, ...(apiWarning ? { _warning: apiWarning } : {}) }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
    const data = await listActiveClientsForTenant(tenantId, { includeInactive });
    // Quantas categorias de veículo cada empresa tem liberadas (para o card da lista).
    const ids = data.map((c) => c.id);
    const enabledByClient = new Map<string, Set<string>>();
    if (ids.length > 0) {
      const { data: prices } = await db
        .from("client_category_prices")
        .select("client_id, category_id")
        .in("client_id", ids)
        .eq("enabled", true);
      for (const p of prices ?? []) {
        const set = enabledByClient.get(p.client_id as string) ?? new Set<string>();
        set.add(p.category_id as string);
        enabledByClient.set(p.client_id as string, set);
      }
    }
    return ok(data.map((c) => ({ ...c, enabled_categories: enabledByClient.get(c.id)?.size ?? 0 })));
  } catch (error) {
    return mapApiError(error);
  }
}
