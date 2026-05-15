import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { presentInAppNotification, type InAppNotificationRow } from "@/lib/notifications/in-app-present";

const listSchema = z.object({
  unreadOnly: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30)
});

/** Lista notificações in-app do utilizador autenticado. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "notifications.read");

    if (session.userId === "anonymous" || session.userId === "system-user") {
      return fail("UNAUTHORIZED", "Sessão inválida", 401);
    }

    const q = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("notifications")
      .select("id, event_type, payload, status, sent_at, read_at, created_at", { count: "exact" })
      .eq("channel", "in_app")
      .eq("recipient_type", "profile")
      .eq("recipient_id", session.userId)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q.unreadOnly) {
      query = query.is("read_at", null);
    }

    const { data, error, count } = await query;
    if (error) return fail("IN_APP_NOTIFICATIONS_LIST_FAILED", error.message, 500);

    const items = (data ?? []).map((row) =>
      presentInAppNotification(row as InAppNotificationRow)
    );

    const { count: unreadCount, error: unreadErr } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("channel", "in_app")
      .eq("recipient_type", "profile")
      .eq("recipient_id", session.userId)
      .eq("status", "sent")
      .is("read_at", null);

    if (unreadErr) return fail("IN_APP_NOTIFICATIONS_UNREAD_COUNT_FAILED", unreadErr.message, 500);

    return ok({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0,
      unreadCount: unreadCount ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("INVALID_REQUEST", message, 400);
  }
}
