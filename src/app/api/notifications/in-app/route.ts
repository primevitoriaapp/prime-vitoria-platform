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

/** Lista notificações in-app do usuário autenticado. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "notifications.read");

    if (session.userId === "anonymous" || session.userId === "system-user") {
      return fail("UNAUTHORIZED", "Sessão inválida", 401);
    }

    // Recupera avisos que ficaram na fila (o sininho consulta a cada minuto).
    if (session.tenantId) {
      try {
        const { processNotificationJobs } = await import("@/lib/jobs/processors");
        await processNotificationJobs({ limit: 20, tenantId: session.tenantId });
      } catch {
        /* segue listando */
      }
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

    const baseItems = (data ?? []).map((row) => presentInAppNotification(row as InAppNotificationRow));
    // Resumo da corrida em cada aviso (data, trajeto, cliente e se já tem motorista) para agir direto do sininho.
    const tripIds = [...new Set(baseItems.map((i) => i.tripId).filter(Boolean))] as string[];
    const tripMap = new Map<string, Record<string, unknown>>();
    if (tripIds.length) {
      const { data: trips } = await db
        .from("trips")
        .select("id, scheduled_at, origin_text, destination_text, passenger_name, driver_id, operational_status, client_id")
        .in("id", tripIds);
      const cIds = [...new Set((trips ?? []).map((t) => t.client_id as string).filter(Boolean))];
      const dIds = [...new Set((trips ?? []).map((t) => t.driver_id as string).filter(Boolean))];
      const [{ data: cs }, { data: ds }] = await Promise.all([
        cIds.length ? db.from("clients").select("id, name, trade_name").in("id", cIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        dIds.length ? db.from("drivers").select("id, full_name").in("id", dIds) : Promise.resolve({ data: [] as Record<string, unknown>[] })
      ]);
      const cn = new Map((cs ?? []).map((c) => [c.id as string, ((c.trade_name as string) || (c.name as string)) ?? ""]));
      const dn = new Map((ds ?? []).map((d) => [d.id as string, (d.full_name as string) ?? ""]));
      for (const t of trips ?? [])
        tripMap.set(t.id as string, {
          scheduled_at: t.scheduled_at,
          route: `${String(t.origin_text ?? "").split(",")[0]} → ${String(t.destination_text ?? "").split(",")[0]}`,
          client: cn.get(t.client_id as string) ?? null,
          driver: t.driver_id ? (dn.get(t.driver_id as string) ?? "Motorista") : null,
          status: t.operational_status
        });
    }
    const items = baseItems.map((i) => ({ ...i, trip: i.tripId ? (tripMap.get(i.tripId) ?? null) : null }));

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
