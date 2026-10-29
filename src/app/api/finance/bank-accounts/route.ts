import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const schema = z.object({
  issuer: z.enum(["rj_prime", "prime_servicos", "ilha_prime"]),
  bank: z.string().trim().min(2).max(40),
  label: z.string().trim().min(2).max(80),
  agency: z.string().trim().max(20).nullable().optional(),
  account: z.string().trim().max(30).nullable().optional(),
  opening_balance: z.coerce.number().min(-100_000_000).max(100_000_000).optional(),
  opening_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

const fin = (r: string) => r === "admin" || r === "financeiro";

export async function GET() {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { data, error } = await db.from("bank_accounts").select("*").eq("tenant_id", tenantId).eq("active", true).order("issuer").order("label");
    if (error) return fail("LIST_FAILED", error.message, 500);
    const ids = (data ?? []).map((a) => a.id as string);
    const pending = new Map<string, number>();
    const moved = new Map<string, number>();
    const lastDate = new Map<string, string>();
    if (ids.length) {
      const { data: lines } = await db.from("bank_statement_lines").select("bank_account_id, status, amount, posted_at").in("bank_account_id", ids).limit(20000);
      const opening = new Map((data ?? []).map((a) => [a.id as string, (a.opening_date as string | null) ?? null]));
      for (const l of lines ?? []) {
        const id = l.bank_account_id as string;
        if (l.status === "pendente") pending.set(id, (pending.get(id) ?? 0) + 1);
        const od = opening.get(id);
        // Saldo = saldo inicial + tudo que entrou/saiu no extrato a partir da data do saldo inicial.
        if (!od || (l.posted_at as string) > od) moved.set(id, (moved.get(id) ?? 0) + Number(l.amount));
        if (!lastDate.has(id) || (l.posted_at as string) > (lastDate.get(id) as string)) lastDate.set(id, l.posted_at as string);
      }
    }
    return ok(
      (data ?? []).map((a) => ({
        ...a,
        pending: pending.get(a.id as string) ?? 0,
        balance: Math.round((Number(a.opening_balance ?? 0) + (moved.get(a.id as string) ?? 0)) * 100) / 100,
        balance_date: lastDate.get(a.id as string) ?? (a.opening_date as string | null) ?? null
      }))
    );
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const b = schema.parse(await request.json());
    const { data, error } = await db.from("bank_accounts").insert({ ...b, tenant_id: tenantId }).select("*").single();
    if (error) return fail("CREATE_FAILED", error.message, 500);
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

/** Ajusta o saldo inicial de uma conta (para o saldo bater com o banco). */
export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const b = z
      .object({
        id: z.string().uuid(),
        opening_balance: z.coerce.number().min(-100_000_000).max(100_000_000),
        opening_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(await request.json());
    const { error } = await db.from("bank_accounts").update({ opening_balance: b.opening_balance, opening_date: b.opening_date }).eq("id", b.id).eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    return ok({ id: b.id });
  } catch (error) {
    return mapApiError(error);
  }
}
