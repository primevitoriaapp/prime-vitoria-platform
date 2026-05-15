import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { can } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { insertAuditEvent } from "@/lib/server/audit-log";
import type { SessionContext } from "@/lib/domain/types";

const patchSchema = z.object({
  status: z.literal("resolved")
});

function canResolveReconciliation(session: SessionContext): boolean {
  return can(session, "finance.write") || can(session, "erp.mapping.write");
}

/** Marca divergencia ERP como resolvida (tenant da sessao). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    runIntegrationGuards(request, "reconciliation-issue-patch");
    const session = await getSessionContext();
    if (!canResolveReconciliation(session)) {
      return fail("FORBIDDEN", "Sem permissao para resolver divergencias", 403);
    }
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const now = new Date().toISOString();
    const { data, error } = await db
      .from("erp_reconciliation_issues")
      .update({ status: body.status, resolved_at: now })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .select("id, provider, entity_type, entity_id, issue_type, status, resolved_at")
      .maybeSingle();

    if (error) return fail("RECONCILIATION_RESOLVE_FAILED", error.message, 500);
    if (!data) return fail("RECONCILIATION_NOT_FOUND", "Divergencia nao encontrada ou ja resolvida", 404);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "erp.reconciliation.resolve",
      entityType: "erp_reconciliation_issue",
      entityId: id,
      metadata: {
        provider: data.provider,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        issue_type: data.issue_type
      },
      request
    });

    return ok(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    return mapApiError(error);
  }
}
