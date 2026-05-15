import { mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";

export async function GET() {
  try {
    const session = await getSessionContext();
    return ok({
      userId: session.userId,
      role: session.role,
      tenantId: session.tenantId ?? null,
      clientId: session.clientId ?? null,
      driverId: session.driverId ?? null
    });
  } catch (error) {
    return mapApiError(error);
  }
}
