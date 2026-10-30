import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const fin = (r: string) => r === "admin" || r === "financeiro";
const SCOPES = ["todas", "rj_prime", "prime_servicos", "ilha_prime"] as const;

/** Meta de faturamento do mês (geral ou por empresa). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? "";
    const scope = url.searchParams.get("scope") ?? "todas";
    const { data } = await db.from("finance_goals").select("revenue_goal").eq("tenant_id", tenantId).eq("month", month).eq("scope", scope).maybeSingle();
    return ok({ month, scope, revenue_goal: data ? Number(data.revenue_goal) : null });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const b = z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/), scope: z.enum(SCOPES).default("todas"), revenue_goal: z.coerce.number().min(0).max(100_000_000) })
      .parse(await request.json());
    const { error } = await db.from("finance_goals").upsert({ ...b, tenant_id: tenantId, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,month,scope" });
    if (error) return fail("SAVE_FAILED", error.message, 500);
    return ok(b);
  } catch (error) {
    return mapApiError(error);
  }
}
