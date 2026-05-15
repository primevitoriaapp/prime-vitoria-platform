import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { uploadPaymentProofFile } from "@/lib/storage/payment-proof-upload";

export const runtime = "nodejs";

/** Upload de comprovante (multipart `file`) para Supabase Storage + registo em `driver_payment_proofs`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id: payableId } = await params;

    const { data: row, error: loadErr } = await db
      .from("driver_payables")
      .select("id, trip_id, amount, status")
      .eq("id", payableId)
      .maybeSingle();

    if (loadErr || !row) return fail("PAYABLE_NOT_FOUND", "Título não encontrado", 404);

    const { data: trip } = await db.from("trips").select("tenant_id").eq("id", row.trip_id).maybeSingle();
    if (!trip || trip.tenant_id !== tenantId) return fail("FORBIDDEN", "Título fora do tenant", 403);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("INVALID_FILE", "Envie o campo multipart `file`.", 400);
    }

    const notes = typeof form.get("notes") === "string" ? String(form.get("notes")).slice(0, 2000) : null;

    const uploaded = await uploadPaymentProofFile({ tenantId, payableId, file });

    const { data: proof, error: insErr } = await db
      .from("driver_payment_proofs")
      .insert({
        tenant_id: tenantId,
        driver_payable_id: payableId,
        trip_id: row.trip_id,
        storage_url: uploaded.public_url,
        amount: row.amount,
        notes,
        uploaded_by: session.userId
      })
      .select("id, storage_url, amount, created_at")
      .single();

    if (insErr) return fail("PROOF_CREATE_FAILED", insErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.driver_payment_proof_upload",
      entityType: "driver_payable",
      entityId: payableId,
      metadata: { proof_id: proof.id, storage_path: uploaded.storage_path },
      request
    });

    return ok({ proof, storage_path: uploaded.storage_path }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
