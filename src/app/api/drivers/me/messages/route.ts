import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { isLive, type DriverMessage } from "@/lib/drivers/driver-messages";

/** Avisos da central para o motorista logado (ativos e dos últimos 30 dias). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const tenantId = assertTenantScope(session);
    const { data: me } = await db.from("drivers").select("vehicle_category_ids").eq("id", session.driverId).maybeSingle();
    const mine = (me?.vehicle_category_ids as string[] | null) ?? [];
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: msgs } = await db
      .from("driver_messages")
      .select("id, title, body, contact_hint, ask_interest, target_category_ids, created_at, expires_at, active")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    const list = ((msgs ?? []) as DriverMessage[]).filter((m) => !m.target_category_ids?.length || m.target_category_ids.some((c) => mine.includes(c)));
    const { data: rec } = list.length
      ? await db.from("driver_message_receipts").select("message_id, read_at, answer").eq("driver_id", session.driverId).in("message_id", list.map((m) => m.id))
      : { data: [] };
    return ok(
      list.map((m) => {
        const r = (rec ?? []).find((x) => x.message_id === m.id);
        return { ...m, live: isLive(m), read_at: r?.read_at ?? null, answer: r?.answer ?? null };
      })
    );
  } catch (e) {
    return mapApiError(e);
  }
}
