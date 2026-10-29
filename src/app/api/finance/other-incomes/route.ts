import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const fin = (r: string) => r === "admin" || r === "financeiro";
const money = z.union([z.number(), z.string()]).transform((v) => {
  const t = String(v).trim();
  const n = typeof v === "number" ? v : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Math.round(n * 100) / 100;
});

const incomeSchema = z.object({
  description: z.string().trim().min(2).max(200),
  category: z.enum(["locacao", "servico_avulso", "reembolso", "venda_ativo", "rendimento", "outros"]).default("outros"),
  client_id: z.string().uuid().nullable().optional(),
  payer: z.string().trim().max(200).nullable().optional(),
  amount: money.pipe(z.number().positive()),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  issuer: z.enum(["rj_prime", "prime_servicos", "ilha_prime"]).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  received: z.boolean().optional()
});

/** Receitas que não vêm de corrida (locação, serviço avulso, reembolso, venda de veículo…). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const url = new URL(request.url);
    let q = db.from("other_incomes").select("*").eq("tenant_id", tenantId).neq("status", "cancelada").order("due_date", { ascending: false }).limit(500);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from) q = q.gte("due_date", from);
    if (to) q = q.lte("due_date", to);
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
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { received, ...b } = incomeSchema.parse(await request.json());
    const { data, error } = await db
      .from("other_incomes")
      .insert({
        ...b,
        tenant_id: tenantId,
        created_by: session.userId,
        ...(received ? { status: "recebida", received_at: b.due_date, received_amount: b.amount } : {})
      })
      .select("*")
      .single();
    if (error) return fail("CREATE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "finance.other_income_create", entityType: "other_income", entityId: data.id as string, metadata: { amount: b.amount }, request });
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
