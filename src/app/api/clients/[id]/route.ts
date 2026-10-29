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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data, error } = await db
      .from("clients")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      const mapped = mapSupabaseError(error, "cliente");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }
    if (!data) return fail("CLIENT_NOT_FOUND", "Cliente nao encontrado", 404);

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const parsed = patchSchema.parse(await request.json());
    const updatePayload = normalizeClientPatch(parsed);

    if (Object.keys(updatePayload).length === 0) {
      return fail("INVALID_BODY", "Nenhum campo para atualizar", 400);
    }

    const { data: existing } = await db
      .from("clients")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("CLIENT_NOT_FOUND", "Cliente nao encontrado", 404);

    const { data, error, partialSave, warning } = await updateClientRow(id, tenantId, updatePayload);
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

    const apiWarning =
      warning ??
      (partialSave
        ? "Atualizado parcialmente — aplique migrations 0044/0046 no Supabase para todos os campos."
        : undefined);

    return ok({ ...data, ...(apiWarning ? { _warning: apiWarning } : {}) });
  } catch (error) {
    return mapApiError(error);
  }
}

/**
 * Excluir empresa (só admin). Com corridas, faturas ou contas a receber no histórico, não apaga:
 * desativa (some das listas e do portal) e mantém o histórico. Sem histórico, apaga de vez.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.delete");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: existing } = await db
      .from("clients")
      .select("id, name")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado.", 404);

    const counts = await Promise.all(
      ["trips", "accounts_receivable", "client_invoices"].map(async (table) => {
        const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("client_id", id);
        return count ?? 0;
      })
    );
    const hasHistory = counts.some((n) => n > 0);

    // Acesso ao portal sai nos dois casos.
    await db.from("profiles").update({ active: false }).eq("client_id", id);

    if (hasHistory) {
      await db.from("clients").update({ active: false }).eq("id", id).eq("tenant_id", tenantId);
      await insertAuditEvent({
        tenantId,
        actorUserId: session.userId,
        action: "client.archive",
        entityType: "client",
        entityId: id,
        metadata: { name: existing.name, reason: "has_history" },
        request
      });
      return ok({
        deleted: false,
        archived: true,
        message: "Esta empresa tem corridas ou faturas no histórico, então foi desativada (some das listas e o portal dela fica bloqueado). O histórico continua guardado."
      });
    }

    await db.from("profiles").update({ client_id: null }).eq("client_id", id);
    for (const table of ["requesters", "cost_centers", "client_departments", "client_units"]) {
      await db.from(table).delete().eq("client_id", id);
    }
    const { error } = await db.from("clients").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) {
      const mapped = mapSupabaseError(error, "cliente");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "client.delete",
      entityType: "client",
      entityId: id,
      metadata: { name: existing.name },
      request
    });
    return ok({ deleted: true, archived: false, message: "Empresa excluída." });
  } catch (error) {
    return mapApiError(error);
  }
}
