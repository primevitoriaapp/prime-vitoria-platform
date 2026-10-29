import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const lineSchema = z.object({
  fit_id: z.string().min(1).max(200),
  posted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite(),
  description: z.string().max(500)
});
const bodySchema = z.object({ bank_account_id: z.string().uuid(), lines: z.array(lineSchema).min(1).max(5000) });

/** Grava os lançamentos do extrato; os que já existem (mesmo identificador) são pulados. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());
    const { data: acc } = await db.from("bank_accounts").select("id").eq("id", body.bank_account_id).eq("tenant_id", tenantId).maybeSingle();
    if (!acc) return fail("NOT_FOUND", "Conta bancária não encontrada", 404);
    const rows = body.lines.map((l) => ({ ...l, tenant_id: tenantId, bank_account_id: body.bank_account_id }));
    const { data, error } = await db
      .from("bank_statement_lines")
      .upsert(rows, { onConflict: "bank_account_id,fit_id", ignoreDuplicates: true })
      .select("id");
    if (error) return fail("IMPORT_FAILED", error.message, 500);
    const inserted = data?.length ?? 0;
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "bank.import", entityType: "bank_account", entityId: body.bank_account_id, metadata: { lines: body.lines.length, inserted }, request });
    return ok({ received: body.lines.length, inserted, skipped: body.lines.length - inserted });
  } catch (error) {
    return mapApiError(error);
  }
}
