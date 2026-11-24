import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { clientRefFromNotes } from "@/lib/trips/client-ref";

const schema = z.object({
  trip_id: z.string().uuid(),
  ref: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9./-]+$/, "Use só letras, números, ponto, barra e hífen (ex.: NR263691-B2)")
});

/**
 * Grava o NR / referência do cliente numa corrida (linha "O.S./Ref.:" das observações), sem avisar o motorista.
 * Usado no fechamento para separar as corridas por NR.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { trip_id, ref } = schema.parse(await request.json());
    const { data: trip } = await db.from("trips").select("id, notes").eq("id", trip_id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const value = ref.toUpperCase();
    const before = (trip.notes as string | null) ?? "";
    const line = `O.S./Ref.: ${value}`;
    const notes = clientRefFromNotes(before) ? before.replace(/O\.S\.\/Ref\.:\s*[^\s,;]+/i, line) : before.trim() ? `${line}\n${before}` : line;
    const { error } = await db.from("trips").update({ notes }).eq("id", trip_id).eq("tenant_id", tenantId);
    if (error) throw error;
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "trip.client_ref", entityType: "trip", entityId: trip_id, metadata: { de: clientRefFromNotes(before), para: value }, request });
    return ok({ ref: value });
  } catch (e) {
    return mapApiError(e);
  }
}
