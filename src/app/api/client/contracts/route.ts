import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { syncPending, type ContractRow } from "@/lib/contracts/contracts";

/** Portal da empresa: contratos (só gestor; solicitante não vê). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    let clientId: string | null = null;
    if (session.role === "cliente") {
      if (session.clientAccess === "solicitante") return fail("FORBIDDEN", "Só o gestor vê os contratos", 403);
      clientId = session.clientId ?? null;
    } else if (["admin", "operador", "financeiro"].includes(session.role)) {
      clientId = new URL(request.url).searchParams.get("client_id");
    }
    if (!clientId) return fail("FORBIDDEN", "Sem empresa", 403);
    const { data } = await db.from("contracts").select("*").eq("tenant_id", tenantId).eq("client_id", clientId).neq("status", "cancelado").order("created_at", { ascending: false });
    const rows = await syncPending((data ?? []) as ContractRow[]);
    return ok(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, signed_at: r.signed_at, sign_url: r.status === "pendente" ? r.sign_url : null })));
  } catch (e) {
    return mapApiError(e);
  }
}
