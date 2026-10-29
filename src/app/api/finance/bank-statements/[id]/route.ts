import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { settle, unsettle } from "@/lib/finance/bank/reconcile-server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("conciliar"), kind: z.enum(["fatura", "recebivel", "conta_pagar", "repasse"]), match_id: z.string().uuid() }),
  z.object({ action: z.literal("marcar"), kind: z.enum(["transferencia", "outro"]), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("nova_conta"), description: z.string().trim().min(2).max(200), category: z.string().max(40).default("outros") }),
  z.object({ action: z.literal("ignorar") }),
  z.object({ action: z.literal("desfazer") })
]);

/** Resolve um lançamento do extrato: conciliar com algo em aberto, marcar, criar conta paga, ignorar ou desfazer. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const { data: line } = await db.from("bank_statement_lines").select("*, bank_accounts(issuer)").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!line) return fail("NOT_FOUND", "Lançamento não encontrado", 404);
    const ln = { posted_at: String(line.posted_at), amount: Number(line.amount) };
    const now = new Date().toISOString();
    let update: Record<string, unknown> = {};

    if (body.action === "desfazer") {
      if (line.match_kind && line.match_id) await unsettle(tenantId, line.match_kind as string, line.match_id as string);
      update = { status: "pendente", match_kind: null, match_id: null, note: null, resolved_by: null, resolved_at: null };
    } else {
      if (line.status !== "pendente") return fail("ALREADY_DONE", "Este lançamento já foi resolvido. Desfaça antes.", 409);
      if (body.action === "conciliar") {
        await settle(tenantId, body.kind, body.match_id, ln);
        update = { status: "conciliado", match_kind: body.kind, match_id: body.match_id };
      } else if (body.action === "marcar") {
        update = { status: "conciliado", match_kind: body.kind, note: body.note ?? null };
      } else if (body.action === "nova_conta") {
        if (ln.amount >= 0) return fail("NOT_DEBIT", "Só saídas viram conta paga.", 400);
        const issuer = (line.bank_accounts as { issuer?: string } | null)?.issuer ?? null;
        const { data: pay, error } = await db
          .from("company_payables")
          .insert({
            tenant_id: tenantId,
            description: body.description,
            category: body.category,
            amount: Math.abs(ln.amount),
            due_date: ln.posted_at,
            status: "paga",
            paid_at: ln.posted_at,
            paid_amount: Math.abs(ln.amount),
            issuer,
            notes: `Criada pela conciliação: ${String(line.description ?? "")}`.slice(0, 1000),
            created_by: session.userId
          })
          .select("id")
          .single();
        if (error) return fail("CREATE_FAILED", error.message, 500);
        update = { status: "conciliado", match_kind: "nova_conta", match_id: pay.id };
      } else if (body.action === "ignorar") {
        update = { status: "ignorado" };
      }
      update = { ...update, resolved_by: session.userId, resolved_at: now };
    }

    const { data, error } = await db.from("bank_statement_lines").update(update).eq("id", id).select("*").single();
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: `bank.${body.action}`, entityType: "bank_statement_line", entityId: id, metadata: update, request });
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
