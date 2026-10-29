import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) })
});

/** Guarda a assinatura de avisos deste aparelho (motorista ou equipe da central). */
export async function POST(request: Request) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role === "guest" || session.userId === "anonymous") return fail("UNAUTHORIZED", "Entre para ativar os avisos", 401);
    const tenantId = assertTenantScope(session);
    const body = subSchema.parse(await request.json());
    const isDriver = session.role === "motorista";
    if (isDriver && !session.driverId) return fail("FORBIDDEN", "Motorista sem cadastro vinculado", 403);
    const row = {
      tenant_id: tenantId,
      profile_id: session.userId,
      driver_id: isDriver ? session.driverId : null,
      role: session.role,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      last_error: null
    };
    const { error } = await db.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) return fail("SUBSCRIBE_FAILED", error.message, 500);
    return ok({ subscribed: true });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionContext();
    const body = z.object({ endpoint: z.string().url() }).parse(await request.json());
    await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("profile_id", session.userId);
    return ok({ removed: true });
  } catch (error) {
    return mapApiError(error);
  }
}
