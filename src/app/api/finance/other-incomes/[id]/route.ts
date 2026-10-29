import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const fin = (r: string) => r === "admin" || r === "financeiro";

/** Dar baixa (recebida), reabrir ou cancelar uma receita avulsa. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!fin(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = z
      .object({
        action: z.enum(["receber", "reabrir", "cancelar"]),
        received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        received_amount: z.coerce.number().positive().optional()
      })
      .parse(await request.json());
    const { data: row } = await db.from("other_incomes").select("amount").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!row) return fail("NOT_FOUND", "Receita não encontrada", 404);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const patch =
      b.action === "receber"
        ? { status: "recebida", received_at: b.received_at ?? today, received_amount: b.received_amount ?? Number(row.amount) }
        : b.action === "reabrir"
          ? { status: "aberta", received_at: null, received_amount: null }
          : { status: "cancelada" };
    const { error } = await db.from("other_incomes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    return ok({ id, ...patch });
  } catch (error) {
    return mapApiError(error);
  }
}
