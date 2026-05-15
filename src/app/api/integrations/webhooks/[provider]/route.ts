import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { verifyWebhookSignature } from "@/lib/integrations/webhook-auth";

const providerSchema = z.enum(["omie", "conta_azul", "generic"]);

function webhookSecret(provider: string): string | undefined {
  const map: Record<string, string | undefined> = {
    omie: process.env.ERP_OMIE_WEBHOOK_SECRET,
    conta_azul: process.env.ERP_CONTA_AZUL_WEBHOOK_SECRET,
    generic: process.env.ERP_WEBHOOK_SECRET
  };
  return map[provider]?.trim() || process.env.ERP_WEBHOOK_SECRET?.trim();
}

/**
 * Webhook inbound ERP (Omie / Conta Azul / generic).
 * Configure `ERP_*_WEBHOOK_SECRET` e header `x-webhook-signature: sha256=<hmac hex do body>`.
 * Opcional: `x-tenant-id` (UUID) para escopo multiempresa.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    runIntegrationGuards(request, "erp-webhook-post");
    const { provider: rawProvider } = await params;
    const provider = providerSchema.parse(rawProvider);

    const rawBody = await request.text();
    const secret = webhookSecret(provider);
    if (!secret) {
      return fail("WEBHOOK_NOT_CONFIGURED", "Segredo de webhook não configurado no servidor", 503);
    }

    const sig = request.headers.get("x-webhook-signature") ?? request.headers.get("x-hub-signature-256");
    if (!verifyWebhookSignature(rawBody, sig, secret)) {
      return fail("INVALID_SIGNATURE", "Assinatura de webhook inválida", 401);
    }

    let payload: unknown = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = { raw: rawBody.slice(0, 2000) };
    }

    const tenantHeader = request.headers.get("x-tenant-id")?.trim();
    const tenantId = z.string().uuid().safeParse(tenantHeader).success ? tenantHeader! : null;

    const { data: inbox, error: inboxErr } = await db
      .from("erp_webhook_inbox")
      .insert({
        tenant_id: tenantId,
        provider,
        payload
      })
      .select("id, received_at")
      .single();

    if (inboxErr) return fail("WEBHOOK_PERSIST_FAILED", inboxErr.message, 500);

    if (tenantId) {
      await insertAuditEvent({
        tenantId,
        actorUserId: null,
        action: `erp.webhook.${provider}`,
        entityType: "erp_webhook_inbox",
        entityId: inbox.id,
        metadata: { inbox_id: inbox.id }
      });
    }

    return ok({ received: true, provider, inbox_id: inbox.id, tenant_id: tenantId });
  } catch (error) {
    return mapApiError(error);
  }
}
