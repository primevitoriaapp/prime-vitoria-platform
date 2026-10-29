import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  payable_ids: z.array(z.string().uuid()).min(1).max(500),
  payment_method: z.string().trim().min(1).max(80).default("pix"),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(120).optional(),
  owner_name: z.string().trim().max(200).optional()
});

/** Paga de uma vez todos os repasses selecionados de um parceiro (um PIX, um lote). */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());
    const paidAt = new Date(`${body.paid_on}T12:00:00-03:00`).toISOString();
    const batch = body.reference || `LOTE-${body.paid_on.replace(/-/g, "")}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const { data, error } = await db
      .from("driver_payables")
      .update({ status: "paid", paid_at: paidAt, payment_method: body.payment_method, batch_id: batch })
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .in("id", body.payable_ids)
      .select("id, amount");
    if (error) return fail("PAY_FAILED", error.message, 500);
    const total = Math.round((data ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.partner_payout_batch",
      entityType: "driver_payable",
      entityId: (data?.[0]?.id as string) ?? body.payable_ids[0],
      metadata: { batch, count: data?.length ?? 0, total, owner: body.owner_name ?? null, method: body.payment_method },
      request
    });
    return ok({ paid: data?.length ?? 0, total, batch });
  } catch (error) {
    return mapApiError(error);
  }
}
