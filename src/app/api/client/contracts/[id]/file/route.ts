import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { contractFileUrl, type ContractRow } from "@/lib/contracts/contracts";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    let q = db.from("contracts").select("*").eq("id", id).eq("tenant_id", tenantId);
    if (session.role === "cliente") {
      if (session.clientAccess === "solicitante" || !session.clientId) return fail("FORBIDDEN", "Sem permissão", 403);
      q = q.eq("client_id", session.clientId);
    } else if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const { data } = await q.maybeSingle();
    if (!data) return fail("NOT_FOUND", "Contrato não encontrado", 404);
    const url = await contractFileUrl(data as ContractRow, "assinado");
    if (!url) return fail("NO_FILE", "Arquivo indisponível agora.", 404);
    return NextResponse.redirect(url);
  } catch (e) {
    return mapApiError(e);
  }
}
