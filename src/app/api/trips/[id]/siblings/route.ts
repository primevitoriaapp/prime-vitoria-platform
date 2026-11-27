import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const OPEN = ["approved", "dispatched", "accepted", "reassigned", "pending_approval", "on_the_way", "arrived"];
const spTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayList = (notes: string | null) => (String(notes ?? "").match(/Carro à disposição: dia \d+ de \d+ \(([^)]+)\)/) ?? [])[1] ?? null;

/**
 * Outros dias do mesmo serviço (carro à disposição de vários dias, ou corridas criadas juntas
 * para o mesmo cliente no mesmo horário). Usado para perguntar "aplicar também aos outros dias?".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: t } = await db.from("trips").select("id, client_id, created_at, scheduled_at, notes, service_type").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t?.client_id) return ok({ siblings: [] });
    const created = new Date(String(t.created_at)).getTime();
    const { data: cands } = await db
      .from("trips")
      .select("id, scheduled_at, notes, created_at, service_type, operational_status")
      .eq("tenant_id", tenantId)
      .eq("client_id", t.client_id as string)
      .neq("id", id)
      .in("operational_status", OPEN)
      .gte("scheduled_at", new Date(Date.now() - 12 * 3600000).toISOString())
      .gte("created_at", new Date(created - 10 * 60000).toISOString())
      .lte("created_at", new Date(created + 10 * 60000).toISOString())
      .order("scheduled_at")
      .limit(60);
    const myDays = dayList(t.notes as string | null);
    const myTime = spTime(String(t.scheduled_at));
    const siblings = (cands ?? []).filter((c) => {
      const d = dayList(c.notes as string | null);
      if (myDays) return d === myDays;
      // Sem marca de série: mesmo horário, mesmo tipo de serviço, criadas juntas.
      return spTime(String(c.scheduled_at)) === myTime && c.service_type === t.service_type && String(c.scheduled_at).slice(0, 10) !== String(t.scheduled_at).slice(0, 10);
    });
    return ok({ siblings: siblings.map((s) => ({ id: s.id, scheduled_at: s.scheduled_at })) });
  } catch (e) {
    return mapApiError(e);
  }
}
