import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { contractFileUrl, type ContractRow } from "@/lib/contracts/contracts";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data } = await db.from("contracts").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!data) return fail("NOT_FOUND", "Contrato não encontrado", 404);
    const which = new URL(request.url).searchParams.get("which") === "original" ? "original" : "assinado";
    const url = await contractFileUrl(data as ContractRow, which);
    if (!url) return fail("NO_FILE", "Arquivo indisponível agora.", 404);
    return NextResponse.redirect(url);
  } catch (e) {
    return mapApiError(e);
  }
}
