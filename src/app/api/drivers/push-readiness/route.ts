import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { getPushReadinessSnapshot } from "@/lib/notifications/push-readiness";

/**
 * Estado push do motorista (sem expor secrets). Útil para banner PWA e smoke FCM.
 */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "motorista" || !session.driverId) {
      return fail("FORBIDDEN", "Apenas motorista autenticado", 403);
    }

    const readiness = getPushReadinessSnapshot();
    const { data: tokenRow } = await db
      .from("driver_push_tokens")
      .select("updated_at, platform")
      .eq("driver_id", session.driverId)
      .maybeSingle();

    return ok({
      ...readiness,
      tokenRegistered: Boolean(tokenRow?.updated_at),
      tokenPlatform: tokenRow?.platform ?? null,
      tokenUpdatedAt: tokenRow?.updated_at ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("PUSH_READINESS_FAILED", message, 500);
  }
}
