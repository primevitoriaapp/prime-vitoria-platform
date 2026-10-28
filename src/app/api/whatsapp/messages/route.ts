import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { whatsappProviderConfigured } from "@/lib/messages/whatsapp-provider";

const statusSchema = z.enum(["pendente", "enviada", "falhou", "ignorada", "todas"]).default("todas");

/** Painel WhatsApp: fila e histórico das mensagens das corridas. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const status = statusSchema.parse(new URL(request.url).searchParams.get("status") ?? undefined);

    let q = db
      .from("whatsapp_messages")
      .select("id, trip_id, event, audience, recipient_name, phone, body, status, error, created_at, sent_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "todas") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail("WHATSAPP_LIST_FAILED", error.message, 500);

    const tripIds = [...new Set((data ?? []).map((m) => m.trip_id).filter(Boolean))] as string[];
    const { data: trips } = tripIds.length
      ? await db.from("trips").select("id, scheduled_at, passenger_name, client_id").in("id", tripIds)
      : { data: [] as { id: string; scheduled_at: string; passenger_name: string | null; client_id: string }[] };
    const clientIds = [...new Set((trips ?? []).map((t) => t.client_id))];
    const { data: clients } = clientIds.length
      ? await db.from("clients").select("id, name, trade_name").in("id", clientIds)
      : { data: [] as { id: string; name: string; trade_name: string | null }[] };
    const clientName = new Map((clients ?? []).map((c) => [c.id, (c.trade_name as string | null) || (c.name as string)]));
    const tripById = new Map((trips ?? []).map((t) => [t.id, t]));

    const { count: pending } = await db
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pendente");

    return ok({
      auto: whatsappProviderConfigured(),
      pending: pending ?? 0,
      items: (data ?? []).map((m) => {
        const t = m.trip_id ? tripById.get(m.trip_id) : null;
        return {
          ...m,
          trip_scheduled_at: t?.scheduled_at ?? null,
          trip_passenger: t?.passenger_name ?? null,
          client_name: t ? (clientName.get(t.client_id) ?? null) : null
        };
      })
    });
  } catch (error) {
    return mapApiError(error);
  }
}
