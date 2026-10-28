import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { saoPauloMonthKey, summarizeClientMonth } from "@/lib/client/client-month-summary";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  client_id: z.string().uuid().optional()
});

/** Resumo do mês da empresa (gestor do cliente ou equipe Prime em modo preview). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const q = querySchema.parse({
      month: url.searchParams.get("month") ?? undefined,
      client_id: url.searchParams.get("client_id") ?? undefined
    });

    let clientId: string | undefined;
    if (session.role === "cliente") {
      if (!session.clientId) return fail("FORBIDDEN", "Conta sem empresa vinculada", 403);
      if (session.clientAccess === "solicitante") {
        return fail("FORBIDDEN", "O resumo da empresa é só para o gestor da conta", 403);
      }
      clientId = session.clientId;
    } else if (session.role === "admin" || session.role === "operador") {
      clientId = q.client_id;
    }
    if (!clientId) return fail("FORBIDDEN", "Sem acesso ao resumo", 403);

    const month = q.month ?? saoPauloMonthKey(new Date().toISOString());
    const [y, m] = month.split("-").map(Number);
    // Janela larga (UTC) e filtro exato pelo mês de Brasília no resumo.
    const from = new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString();
    const to = new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString();

    const { data, error } = await db
      .from("trips")
      .select("operational_status, scheduled_at, client_amount, km_billable, actual_km, planned_km")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .gte("scheduled_at", from)
      .lt("scheduled_at", to)
      .limit(2000);
    if (error) return fail("SUMMARY_FAILED", error.message, 500);

    return ok(summarizeClientMonth(data ?? [], month));
  } catch (error) {
    return mapApiError(error);
  }
}
