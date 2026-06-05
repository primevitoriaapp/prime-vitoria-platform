import { updateClientRow } from "@/lib/clients/client-db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";
import { mapSupabaseError } from "@/lib/server/supabase-errors";
import { uploadClientContractFile } from "@/lib/storage/client-contract-upload";
import { insertAuditEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";

/** Upload do contrato PDF do cliente (máx. 10 MB). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: existing } = await db
      .from("clients")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("INVALID_FILE", "Seleccione um PDF.", 400);
    }

    let uploaded: Awaited<ReturnType<typeof uploadClientContractFile>>;
    try {
      uploaded = await uploadClientContractFile({ tenantId, clientId: id, file });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha no upload";
      if (/Bucket not found|bucket/i.test(message)) {
        return fail(
          "STORAGE_NOT_CONFIGURED",
          "Armazenamento de contratos não configurado no Supabase.",
          503,
          "Aplicar migration 0058_client_contract_storage.sql."
        );
      }
      return fail("CONTRACT_UPLOAD_FAILED", message, 400);
    }

    const { data, error, partialSave } = await updateClientRow(id, tenantId, {
      contract_storage_path: uploaded.storage_path
    });

    if (error || !data) {
      const mapped = mapSupabaseError(error!, "contrato do cliente");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "client.contract_upload",
      entityType: "client",
      entityId: id,
      metadata: { storage_path: uploaded.storage_path, partialSave: partialSave ?? false },
      request
    });

    return ok({ storage_path: uploaded.storage_path }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
