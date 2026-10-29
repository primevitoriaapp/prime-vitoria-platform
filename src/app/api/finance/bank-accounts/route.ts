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
  account: z.string().trim().max(30).nullable().optional()
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
    if (ids.length) {
      const { data: lines } = await db.from("bank_statement_lines").select("bank_account_id").in("bank_account_id", ids).eq("status", "pendente");
      for (const l of lines ?? []) pending.set(l.bank_account_id as string, (pending.get(l.bank_account_id as string) ?? 0) + 1);
    }
    return ok((data ?? []).map((a) => ({ ...a, pending: pending.get(a.id as string) ?? 0 })));
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
