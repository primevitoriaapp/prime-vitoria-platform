import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

/** Marca todas as notificações in-app do utilizador como lidas. */
export async function POST() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "notifications.read");

    if (session.userId === "anonymous" || session.userId === "system-user") {
      return fail("UNAUTHORIZED", "Sessão inválida", 401);
    }

    const now = new Date().toISOString();
    const { data, error } = await db
      .from("notifications")
      .update({ read_at: now })
      .eq("channel", "in_app")
      .eq("recipient_type", "profile")
      .eq("recipient_id", session.userId)
      .eq("status", "sent")
      .is("read_at", null)
      .select("id");

    if (error) return fail("IN_APP_NOTIFICATIONS_READ_ALL_FAILED", error.message, 500);

    return ok({ updated: data?.length ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("INVALID_REQUEST", message, 400);
  }
}
