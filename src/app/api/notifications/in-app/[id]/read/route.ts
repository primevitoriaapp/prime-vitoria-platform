import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Marca uma notificação in-app como lida (só do próprio destinatário). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!uuidRe.test(id)) return fail("INVALID_ID", "ID inválido", 400);

    const session = await getSessionContext();
    assertCapability(session, "notifications.read");

    if (session.userId === "anonymous" || session.userId === "system-user") {
      return fail("UNAUTHORIZED", "Sessão inválida", 401);
    }

    const now = new Date().toISOString();
    const { data, error } = await db
      .from("notifications")
      .update({ read_at: now })
      .eq("id", id)
      .eq("channel", "in_app")
      .eq("recipient_type", "profile")
      .eq("recipient_id", session.userId)
      .select("id, read_at")
      .maybeSingle();

    if (error) return fail("IN_APP_NOTIFICATION_READ_FAILED", error.message, 500);
    if (!data) return fail("NOT_FOUND", "Notificação não encontrada", 404);

    return ok({ id: data.id, readAt: data.read_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("INVALID_REQUEST", message, 400);
  }
}
