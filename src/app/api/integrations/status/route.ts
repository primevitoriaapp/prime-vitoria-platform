import { mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { buildErpIntegrationStatus } from "@/lib/integrations/erp-status.ts";

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "erp.mapping.read");
    return ok(buildErpIntegrationStatus());
  } catch (error) {
    return mapApiError(error);
  }
}
