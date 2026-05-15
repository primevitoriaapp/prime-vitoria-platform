import { fail, mapApiError, ok } from "@/lib/server/http";
import { closeFinancialClosing } from "@/lib/finance/close-closing";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const result = await closeFinancialClosing(id, tenantId, session.userId, request);
    if ("error" in result) {
      if (result.error === "CLOSING_NOT_FOUND") return fail("CLOSING_NOT_FOUND", "Fechamento não encontrado", 404);
      if (result.error.startsWith("INVALID_STATUS")) {
        return fail("INVALID_STATUS", result.error.replace("INVALID_STATUS:", ""), 409);
      }
      return fail("CLOSING_UPDATE_FAILED", result.error, 500);
    }
    if (result.already) return ok({ id, status: "closed", already: true });

    return ok({ id, status: "closed", closed_at: result.closed_at });
  } catch (error) {
    return mapApiError(error);
  }
}
