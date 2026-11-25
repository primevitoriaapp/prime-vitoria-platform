import { db } from "../server/db";
import { pushToDriver } from "@/lib/push/web-push";

export type SendDriverPushResult = { ok: true } | { ok: false; reason: string };

export type DriverTripPushKind = "nova" | "alterada" | "cancelada" | "removida" | "lembrete";

const TITLES: Record<DriverTripPushKind, string> = {
  nova: "🚘 Nova corrida para você",
  alterada: "✏️ Corrida alterada",
  cancelada: "❌ Corrida cancelada",
  removida: "Corrida passada para outro motorista",
  lembrete: "⏰ Sua corrida está chegando"
};

function short(addr: string | null | undefined) {
  return String(addr ?? "").split(",")[0].trim() || "—";
}

/** Aviso no celular do motorista sobre uma corrida (Web Push). */
export async function pushTripToDriver(
  tenantId: string,
  driverId: string,
  tripId: string,
  kind: DriverTripPushKind,
  opts: { whatsapp?: boolean } = {}
): Promise<SendDriverPushResult> {
  const { data: t } = await db.from("trips").select("scheduled_at, origin_text, destination_text, passenger_name").eq("id", tripId).maybeSingle();
  const when = t?.scheduled_at
    ? new Date(t.scheduled_at as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  const body = t ? `${when} · ${short(t.origin_text as string)} → ${short(t.destination_text as string)}${t.passenger_name ? ` · ${t.passenger_name}` : ""}` : "Abra o app para ver.";
  // WhatsApp oficial junto com o push (nova, alterada, cancelada/retirada). Lembrete fica só no push.
  const waKind = kind === "nova" ? "motorista_nova" : kind === "alterada" ? "motorista_alterada" : kind === "cancelada" || kind === "removida" ? "motorista_cancelada" : null;
  const wa = waKind && opts.whatsapp !== false
    ? await import("@/lib/messages/driver-whatsapp-notify")
        .then((m) => m.notifyDriverWhatsapp(tenantId, driverId, tripId, waKind))
        .catch(() => null)
    : null;
  const sent = await pushToDriver(tenantId, driverId, {
    title: TITLES[kind],
    body,
    url: kind === "removida" ? "/driver" : `/driver?trip=${encodeURIComponent(tripId)}`,
    tag: `trip-${tripId}`,
    tripId
  });
  if (sent > 0 || wa?.status === "enviada") return { ok: true };
  return { ok: false, reason: "Motorista sem avisos ativados no celular" };
}

/** Notifica motorista de corrida despachada (push imediato). */
export async function notifyDriverDispatchedNow(tenantId: string, driverId: string, tripId: string): Promise<SendDriverPushResult> {
  return pushTripToDriver(tenantId, driverId, tripId, "nova");
}

/** Compatibilidade: aviso genérico ao motorista. */
export async function sendDriverPushNow(tenantId: string, driverId: string, payload: Record<string, unknown>): Promise<SendDriverPushResult> {
  const tripId = typeof payload.tripId === "string" ? payload.tripId : null;
  const ev = String(payload.eventType ?? "");
  const kind: DriverTripPushKind = ev === "trip.dispatched" ? "nova" : ev === "trip.cancelled" ? "cancelada" : "alterada";
  // Finalizada / no-show: só push (o motorista mesmo fez; não precisa de WhatsApp).
  const whatsapp = ev === "trip.dispatched" || ev === "trip.cancelled";
  if (tripId) return pushTripToDriver(tenantId, driverId, tripId, kind, { whatsapp });
  const sent = await pushToDriver(tenantId, driverId, { title: "Prime Vitória", body: String(payload.body ?? "Atualização da central"), url: "/driver" });
  return sent > 0 ? { ok: true } : { ok: false, reason: "Motorista sem avisos ativados no celular" };
}
