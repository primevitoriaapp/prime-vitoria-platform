import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { getPushReadinessSnapshot } from "@/lib/notifications/push-readiness";
import { assertCapability } from "@/lib/security/rbac";

const STAFF_ROLES = new Set(["admin", "operador", "financeiro"]);

/**
 * Estado push do motorista (sem expor secrets). Útil para banner PWA e smoke FCM.
 * Admin/operador podem consultar com `?driver_id=` (preview do app motorista).
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const readiness = getPushReadinessSnapshot();

    let driverId: string | undefined;
    if (session.role === "motorista") {
      if (!session.driverId) {
        return fail("FORBIDDEN", "Perfil motorista sem vínculo de driver_id", 403);
      }
      driverId = session.driverId;
    } else if (STAFF_ROLES.has(session.role)) {
      assertCapability(session, "driver.read");
      const fromQuery = new URL(request.url).searchParams.get("driver_id")?.trim();
      driverId = fromQuery || session.driverId || undefined;
      if (!driverId) {
        return ok({
          ...readiness,
          tokenRegistered: false,
          tokenPlatform: null,
          tokenUpdatedAt: null,
          previewMode: true
        });
      }
    } else {
      return fail("FORBIDDEN", "Sem permissão para consultar push", 403);
    }

    const { data: tokenRow } = await db
      .from("driver_push_tokens")
      .select("updated_at, platform")
      .eq("driver_id", driverId)
      .maybeSingle();

    return ok({
      ...readiness,
      tokenRegistered: Boolean(tokenRow?.updated_at),
      tokenPlatform: tokenRow?.platform ?? null,
      tokenUpdatedAt: tokenRow?.updated_at ?? null,
      ...(STAFF_ROLES.has(session.role) ? { previewMode: true, driverId } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("PUSH_READINESS_FAILED", message, 500);
  }
}
