import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Chave PIX e favorecido de uma conta (usados quando a fatura é cobrada por PIX). */
export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const b = z
      .object({
        id: z.string().uuid(),
        pix_key: z.string().trim().max(120).nullable().optional(),
        holder_name: z.string().trim().max(120).nullable().optional(),
        holder_document: z.string().trim().max(30).nullable().optional()
      })
      .parse(await request.json());
    const patch: Record<string, unknown> = {};
    for (const k of ["pix_key", "holder_name", "holder_document"] as const) if (b[k] !== undefined) patch[k] = b[k] || null;
    const { data, error } = await db.from("bank_accounts").update(patch).eq("id", b.id).eq("tenant_id", tenantId).select("*").maybeSingle();
    if (error || !data) return fail("SAVE_FAILED", error?.message ?? "Conta não encontrada", 400);
    return ok(data);
  } catch (e) {
    return mapApiError(e);
  }
}
