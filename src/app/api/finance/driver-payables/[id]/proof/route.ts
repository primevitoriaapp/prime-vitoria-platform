import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { loadDriverPayableForSession } from "@/lib/finance/driver-payable-access";

const bodySchema = z.object({
  storage_url: z.string().url().max(2048),
  amount: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional()
});

/** Regista comprovante de pagamento (URL storage — upload feito fora da API). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id: payableId } = await params;
    const body = bodySchema.parse(await request.json());

    const access = await loadDriverPayableForSession(session, tenantId, payableId);
    if ("error" in access) return access.error;

    const { data: row, error: loadErr } = await db
      .from("driver_payables")
      .select("id, trip_id, amount, status")
      .eq("id", payableId)
      .maybeSingle();

    if (loadErr || !row) return fail("PAYABLE_NOT_FOUND", "Título não encontrado", 404);

    const { data: proof, error: insErr } = await db
      .from("driver_payment_proofs")
      .insert({
        tenant_id: tenantId,
        driver_payable_id: payableId,
        trip_id: row.trip_id,
        storage_url: body.storage_url,
        amount: body.amount ?? row.amount,
        notes: body.notes ?? null,
        uploaded_by: session.userId
      })
      .select("id, storage_url, amount, created_at")
      .single();

    if (insErr) return fail("PROOF_CREATE_FAILED", insErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.driver_payment_proof",
      entityType: "driver_payable",
      entityId: payableId,
      metadata: { proof_id: proof.id, storage_url: body.storage_url },
      request
    });

    return ok({ proof }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id: payableId } = await params;

    const access = await loadDriverPayableForSession(session, tenantId, payableId, "read");
    if ("error" in access) return access.error;

    const { data: proofs, error } = await db
      .from("driver_payment_proofs")
      .select("id, storage_url, amount, notes, uploaded_by, created_at")
      .eq("driver_payable_id", payableId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) return fail("PROOF_LIST_FAILED", error.message, 500);

    return ok({ items: proofs ?? [] });
  } catch (error) {
    return mapApiError(error);
  }
}
