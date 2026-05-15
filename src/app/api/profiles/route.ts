import { db } from "@/lib/server/db";
import { mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "profiles.read");
    const tenantId = assertTenantScope(session);

    const { data, error } = await db
      .from("profiles")
      .select("id, name, phone, role, client_id, active, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return mapApiError(new Error(error.message));
    }

    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}
