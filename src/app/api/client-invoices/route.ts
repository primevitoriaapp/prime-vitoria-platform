import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { listClientInvoices } from "@/lib/finance/client-invoices";
import { isFinanceStaff } from "@/lib/finance/client-invoice-access";
import { db } from "@/lib/server/db";

/** Lista de faturas: equipe Prime (todas ou de um cliente) ou gestor (só da própria empresa). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const clientParam = z.string().uuid().optional().parse(url.searchParams.get("client_id") ?? undefined);

    if (isFinanceStaff(session)) {
      const rows = await listClientInvoices(tenantId, { clientId: clientParam, includeCancelled: true });
      const ids = [...new Set(rows.map((r) => r.client_id))];
      const { data: clients } = ids.length
        ? await db.from("clients").select("id, name, trade_name").in("id", ids)
        : { data: [] as { id: string; name: string; trade_name: string | null }[] };
      const names = new Map((clients ?? []).map((c) => [c.id, (c.trade_name as string | null) || (c.name as string)]));
      return ok(rows.map((r) => ({ ...r, client_name: names.get(r.client_id) ?? null })));
    }

    if (session.role === "cliente" && session.clientId && session.clientAccess !== "solicitante") {
      return ok(await listClientInvoices(tenantId, { clientId: session.clientId }));
    }
    return fail("FORBIDDEN", "Sem acesso às faturas", 403);
  } catch (error) {
    return mapApiError(error);
  }
}
