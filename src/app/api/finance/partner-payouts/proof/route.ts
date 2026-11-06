import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";

const bodySchema = z.object({
  payable_ids: z.array(z.string().uuid()).min(1).max(500),
  notify: z.boolean().default(false)
});

/**
 * Anexa (ou troca) o comprovante de repasses JÁ pagos — para quando esqueceu de anexar na hora.
 * Multipart: `payload` (JSON) + `file`. Opcional: reenviar o e-mail ao motorista com o comprovante.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const form = await request.formData();
    const body = bodySchema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("FILE_REQUIRED", "Escolha o arquivo do comprovante.", 400);
    if (file.size > 5 * 1024 * 1024) return fail("FILE_TOO_BIG", "Comprovante acima de 5 MB.", 400);

    const { data: rows } = await db
      .from("driver_payables")
      .select("id, trip_id, amount, status, paid_at, payment_method, batch_id")
      .eq("tenant_id", tenantId)
      .in("id", body.payable_ids);
    const paid = (rows ?? []).filter((r) => r.status === "paid");
    if (!paid.length) return fail("NOT_PAID", "Só dá para anexar comprovante em repasse já pago.", 400);

    const { uploadPaymentProofFile } = await import("@/lib/storage/payment-proof-upload");
    const up = await uploadPaymentProofFile({ tenantId, payableId: paid[0].id as string, file });
    const ids = paid.map((r) => r.id as string);
    // Troca: o comprovante novo substitui o anterior desses repasses.
    await db.from("driver_payment_proofs").delete().eq("tenant_id", tenantId).in("driver_payable_id", ids);
    const { error } = await db.from("driver_payment_proofs").insert(
      paid.map((r) => ({
        tenant_id: tenantId,
        driver_payable_id: r.id,
        trip_id: r.trip_id,
        storage_url: up.public_url,
        amount: r.amount,
        notes: r.batch_id ? `Lote ${r.batch_id}` : "Anexado depois do pagamento",
        uploaded_by: session.userId
      }))
    );
    if (error) return fail("PROOF_SAVE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.partner_payout_proof",
      entityType: "driver_payable",
      entityId: ids[0],
      metadata: { count: ids.length, arquivo: file.name, reenviado: body.notify },
      request
    });

    let emailed = 0;
    let notEmailed: string[] = [];
    if (body.notify) {
      try {
        const { emailDriverPayment } = await import("@/lib/notifications/driver-payment-email");
        const buf = Buffer.from(await file.arrayBuffer());
        const ext = (file.name.split(".").pop() || "pdf").toLowerCase().slice(0, 5);
        const first = paid[0];
        const paidOn = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date((first.paid_at as string) ?? Date.now()));
        const batch = (first.batch_id as string | null) ?? `PAG-${paidOn.replace(/-/g, "")}`;
        const r = await emailDriverPayment({
          tenantId,
          payableIds: ids,
          paidOn,
          method: (first.payment_method as string | null) ?? "pix",
          batch,
          proof: { filename: `Comprovante-${batch}.${ext}`, base64: buf.toString("base64"), contentType: file.type || "application/pdf" }
        });
        emailed = r.sent;
        notEmailed = r.skipped;
      } catch (e) {
        console.warn("[partner-payouts.proof] e-mail", e instanceof Error ? e.message : e);
      }
    }
    return ok({ attached: ids.length, emailed, notEmailed });
  } catch (error) {
    return mapApiError(error);
  }
}
