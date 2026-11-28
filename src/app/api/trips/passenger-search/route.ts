import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Busca passageiros pelo nome nas corridas (30 dias atrás até 90 à frente), com o cliente de cada um. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return ok({ items: [] });
    const safe = q.replace(/[%_\\,()]/g, " ").trim();
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const to = new Date(Date.now() + 90 * 86400000).toISOString();
    const { data, error } = await db
      .from("trips")
      .select("passenger_name, passenger_phone, client_id, scheduled_at")
      .eq("tenant_id", tenantId)
      .ilike("passenger_name", `%${safe}%`)
      .gte("scheduled_at", from)
      .lt("scheduled_at", to)
      .order("scheduled_at", { ascending: false })
      .limit(200);
    if (error) return fail("SEARCH_FAILED", error.message, 500);
    const groups = new Map<string, { passenger: string; client_id: string; count: number; next: string | null; phone: string | null }>();
    const now = Date.now();
    for (const t of data ?? []) {
      const name = String(t.passenger_name ?? "").trim();
      if (!name || !t.client_id) continue;
      const key = `${name.toLowerCase()}|${t.client_id}`;
      const g = groups.get(key) ?? { passenger: name, client_id: String(t.client_id), count: 0, next: null, phone: null };
      g.count += 1;
      g.phone ||= (t.passenger_phone as string | null) ?? null;
      const at = String(t.scheduled_at);
      if (Date.parse(at) >= now && (!g.next || at < g.next)) g.next = at;
      groups.set(key, g);
    }
    const ids = [...new Set([...groups.values()].map((g) => g.client_id))];
    const { data: clients } = ids.length ? await db.from("clients").select("id, name, trade_name").in("id", ids) : { data: [] };
    const cName = new Map((clients ?? []).map((c) => [c.id as string, ((c.trade_name as string | null) || (c.name as string)) ?? ""]));
    const items = [...groups.values()].slice(0, 8).map((g) => ({ ...g, client_name: cName.get(g.client_id) ?? "" }));
    return ok({ items });
  } catch (e) {
    return mapApiError(e);
  }
}
