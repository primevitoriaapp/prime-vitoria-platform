import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { staffFinance } from "@/lib/finance/company-payables-schema";

/** Última conta desse fornecedor: repete categoria e empresa (aprende com o histórico). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staffFinance(session.role)) return fail("FORBIDDEN", "Sem acesso ao financeiro", 403);
    const tenantId = assertTenantScope(session);
    const supplier = (new URL(request.url).searchParams.get("supplier") ?? "").trim();
    if (supplier.length < 3) return ok(null);
    const key = supplier.split(/\s+/).slice(0, 3).join(" ").replace(/[%_]/g, "");
    const { data } = await db
      .from("company_payables")
      .select("category, issuer, description")
      .eq("tenant_id", tenantId)
      .ilike("supplier", `%${key}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return ok(data ?? null);
  } catch (error) {
    return mapApiError(error);
  }
}
