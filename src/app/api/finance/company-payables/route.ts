import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { payableSchema, staffFinance } from "@/lib/finance/company-payables-schema";

/** Contas a pagar da empresa (fora os repasses de motoristas, que têm tela própria). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staffFinance(session.role)) return fail("FORBIDDEN", "Sem acesso ao financeiro", 403);
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const status = url.searchParams.get("status");
    let q = db.from("company_payables").select("*").eq("tenant_id", tenantId).order("due_date", { ascending: true }).limit(1000);
    if (from) q = q.gte("due_date", from);
    if (to) q = q.lte("due_date", to);
    if (status === "abertas") q = q.eq("status", "aberta");
    const { data, error } = await q;
    if (error) return fail("LIST_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staffFinance(session.role)) return fail("FORBIDDEN", "Sem acesso ao financeiro", 403);
    const tenantId = assertTenantScope(session);
    const { installments, ...b } = payableSchema.parse(await request.json());
    const n = installments ?? 1;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const [y, m, d] = b.due_date.split("-").map(Number);
      const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
      const due = new Date(Date.UTC(y, m - 1 + i, Math.min(d, last))).toISOString().slice(0, 10);
      rows.push({
        ...b,
        description: n > 1 ? `${b.description} (${i + 1}/${n})` : b.description,
        due_date: due,
        recurrence: n > 1 ? "nenhuma" : b.recurrence,
        supplier: b.supplier || null,
        issuer: b.issuer ?? null,
        notes: b.notes || null,
        tenant_id: tenantId,
        created_by: session.userId
      });
    }
    const { data, error } = await db.from("company_payables").insert(rows).select("*");
    if (error) return fail("CREATE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "company_payable.create",
      entityType: "company_payable",
      entityId: (data?.[0]?.id as string) ?? null,
      metadata: { description: b.description, amount: b.amount, parcelas: n },
      request
    });
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
