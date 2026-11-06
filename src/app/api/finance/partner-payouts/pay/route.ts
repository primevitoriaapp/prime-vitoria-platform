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
  owner_name: z.string().trim().max(200).optional(),
  notify: z.boolean().default(true)
});

export const runtime = "nodejs";

/** Aceita JSON ou multipart (campo `payload` com o JSON + `file` com o comprovante). */
async function readBody(request: Request): Promise<{ body: z.infer<typeof bodySchema>; file: File | null }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const body = bodySchema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
    const f = form.get("file");
    return { body, file: f instanceof File && f.size > 0 ? f : null };
  }
  return { body: bodySchema.parse(await request.json()), file: null };
}

/** Paga de uma vez todos os repasses selecionados de um parceiro (um PIX, um lote). */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { body, file } = await readBody(request);
    if (file && file.size > 5 * 1024 * 1024) return fail("FILE_TOO_BIG", "Comprovante acima de 5 MB.", 400);
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

    const paidIds = (data ?? []).map((r) => r.id as string);
    // Comprovante: um arquivo para o lote todo, ligado a cada repasse pago.
    let proof: { filename: string; base64: string; contentType: string } | null = null;
    let proofSaved = false;
    if (file && paidIds.length) {
      try {
        const { uploadPaymentProofFile } = await import("@/lib/storage/payment-proof-upload");
        const up = await uploadPaymentProofFile({ tenantId, payableId: paidIds[0], file });
        const { data: rows } = await db.from("driver_payables").select("id, trip_id, amount").in("id", paidIds);
        await db.from("driver_payment_proofs").insert(
          (rows ?? []).map((r) => ({
            tenant_id: tenantId,
            driver_payable_id: r.id,
            trip_id: r.trip_id,
            storage_url: up.public_url,
            amount: r.amount,
            notes: `Lote ${batch}`,
            uploaded_by: session.userId
          }))
        );
        const buf = Buffer.from(await file.arrayBuffer());
        const ext = (file.name.split(".").pop() || "pdf").toLowerCase().slice(0, 5);
        proof = { filename: `Comprovante-${batch}.${ext}`, base64: buf.toString("base64"), contentType: file.type || "application/pdf" };
        proofSaved = true;
      } catch (e) {
        console.warn("[partner-payouts.pay] comprovante", e instanceof Error ? e.message : e);
      }
    }

    let emailed = 0;
    let notEmailed: string[] = [];
    if (body.notify && paidIds.length) {
      try {
        const { emailDriverPayment } = await import("@/lib/notifications/driver-payment-email");
        const r = await emailDriverPayment({ tenantId, payableIds: paidIds, paidOn: body.paid_on, method: body.payment_method, batch, proof });
        emailed = r.sent;
        notEmailed = r.skipped;
      } catch (e) {
        console.warn("[partner-payouts.pay] e-mail", e instanceof Error ? e.message : e);
      }
    }
    // Aviso no celular do motorista (app): pagamento feito, confira na Carteira.
    let pushed = 0;
    if (paidIds.length) {
      try {
        const { pushToDriver } = await import("@/lib/push/web-push");
        const { data: byDrv } = await db.from("driver_payables").select("driver_id, amount").in("id", paidIds);
        const sums = new Map<string, { total: number; n: number }>();
        for (const r of byDrv ?? []) {
          const k = r.driver_id as string;
          const cur = sums.get(k) ?? { total: 0, n: 0 };
          sums.set(k, { total: cur.total + Number(r.amount), n: cur.n + 1 });
        }
        for (const [driverId, v] of sums) {
          const brl = (Math.round(v.total * 100) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          pushed += await pushToDriver(tenantId, driverId, {
            title: "💰 Pagamento feito pela Prime",
            body: `${brl} · ${v.n} corrida(s). Confira na sua Carteira.`,
            url: "/driver"
          }).catch(() => 0);
        }
      } catch (e) {
        console.warn("[partner-payouts.pay] push", e instanceof Error ? e.message : e);
      }
    }
    return ok({ paid: paidIds.length, total, batch, proofSaved, emailed, notEmailed, pushed });
  } catch (error) {
    return mapApiError(error);
  }
}
