import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";

const paramsSchema = z.object({ id: z.string().uuid() });

function mapIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
  if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
  if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
  return mapApiError(error);
}

/** Recoloca webhook na fila (`pending`) para reprocessamento. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    runIntegrationGuards(request, "webhook-inbox-reprocess-post");
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);

    const { id } = paramsSchema.parse(await params);

    const { data: row, error: fetchErr } = await db
      .from("erp_webhook_inbox")
      .select("id, status, tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return fail("WEBHOOK_INBOX_FETCH_FAILED", fetchErr.message, 500);
    if (!row || row.tenant_id !== tenantId) {
      return fail("WEBHOOK_NOT_FOUND", "Webhook não encontrado", 404);
    }

    if (row.status === "pending") {
      return ok({ id, status: "pending", already: true });
    }

    if (row.status === "processed") {
      return fail("WEBHOOK_ALREADY_PROCESSED", "Webhook já processado com sucesso", 409);
    }

    const { error: updErr } = await db
      .from("erp_webhook_inbox")
      .update({
        status: "pending",
        processed_at: null,
        last_error: null
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (updErr) return fail("WEBHOOK_REPROCESS_FAILED", updErr.message, 500);

    return ok({ id, status: "pending" });
  } catch (error) {
    return mapIntegrationError(error);
  }
}
