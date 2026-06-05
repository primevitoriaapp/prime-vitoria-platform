import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";
import { resolveClientContractSignedUrl } from "@/lib/storage/client-contract-upload";

/** URL assinada para visualizar o contrato PDF do cliente. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    if (session.role === "cliente") {
      if (!session.clientId || session.clientId !== id) {
        return fail("FORBIDDEN", "Acesso restrito", 403);
      }
    } else if (!can(session, "client.read")) {
      assertCapability(session, "client.read");
    }

    const { data, error } = await db
      .from("clients")
      .select("contract_storage_path")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) return fail("CLIENT_LOAD_FAILED", error.message, 500);
    if (!data) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const path = (data as { contract_storage_path?: string | null }).contract_storage_path;
    if (!path?.trim()) {
      return fail("CONTRACT_NOT_FOUND", "Nenhum contrato disponível para este cliente.", 404);
    }

    const url = await resolveClientContractSignedUrl(path);
    if (!url) {
      return fail("CONTRACT_URL_FAILED", "Não foi possível gerar o link do contrato.", 500);
    }

    return ok({ url });
  } catch (error) {
    return mapApiError(error);
  }
}
