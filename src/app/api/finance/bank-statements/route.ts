import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { suggestMatches } from "@/lib/finance/bank/statement-parse";
import { loadCandidates } from "@/lib/finance/bank/reconcile-server";

/** Lançamentos de uma conta no período, com sugestões para os pendentes. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    const accountId = url.searchParams.get("account");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!accountId) return fail("MISSING_ACCOUNT", "Escolha a conta", 400);
    const { data: acc } = await db.from("bank_accounts").select("*").eq("id", accountId).eq("tenant_id", tenantId).maybeSingle();
    if (!acc) return fail("NOT_FOUND", "Conta não encontrada", 404);
    let q = db.from("bank_statement_lines").select("*").eq("bank_account_id", accountId).order("posted_at", { ascending: true }).limit(3000);
    if (from) q = q.gte("posted_at", from);
    if (to) q = q.lte("posted_at", to);
    const { data: lines, error } = await q;
    if (error) return fail("LIST_FAILED", error.message, 500);
    const candidates = await loadCandidates(tenantId, acc.issuer as string);
    const items = (lines ?? []).map((l) => {
      const line = { fit_id: l.fit_id as string, posted_at: String(l.posted_at), amount: Number(l.amount), description: String(l.description ?? "") };
      return { ...l, amount: Number(l.amount), suggestions: l.status === "pendente" ? suggestMatches(line, candidates) : [] };
    });
    return ok({ account: acc, items, open_candidates: candidates });
  } catch (error) {
    return mapApiError(error);
  }
}
