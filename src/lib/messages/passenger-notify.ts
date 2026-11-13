import { db } from "@/lib/server/db";
import { normalizeWhatsappPhone } from "@/lib/messages/templates";
import { tripContacts } from "@/lib/trips/trip-contacts";
import { ensureTripTrackToken } from "@/lib/public/ensure-track-token";
import { resolveDefaultVehicleForDriver } from "@/lib/vehicles/driver-default-vehicle";
import {
  dayPhrase,
  passengerTemplate,
  renderPassengerTemplate,
  type PassengerNotifyKind
} from "@/lib/messages/passenger-whatsapp-templates";
import { cloudReady, getWhatsappCloudConfig, sendWhatsappTemplate } from "@/lib/messages/whatsapp-cloud";

/** Regras para não pesar no WhatsApp do cliente. */
const RATING_EVERY_DAYS = 7;

function first(s?: string | null) {
  return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}

function place(a?: string | null) {
  return String(a ?? "").split(",")[0].trim();
}

/**
 * Avisa as pessoas da corrida (passageiro principal e quem embarca/desce nas paradas).
 * Nunca manda duas vezes o mesmo aviso para o mesmo telefone na mesma corrida.
 * Modo "teste": registra o que seria enviado, sem enviar.
 */
export async function notifyPassengers(tenantId: string, tripId: string, kind: PassengerNotifyKind): Promise<{ sent: number; simulated: number; skipped: number }> {
  const res = { sent: 0, simulated: 0, skipped: 0 };
  const cfg = await getWhatsappCloudConfig();
  if (cfg.mode === "desligado") return res;

  const { data: trip } = await db
    .from("trips")
    .select("id, tenant_id, client_id, driver_id, vehicle_id, scheduled_at, origin_text, destination_text, passenger_name, passenger_phone, trip_pickup_stops, trip_dropoff_stops, operational_status")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!trip?.driver_id) return res;

  if (trip.client_id) {
    const { data: cl } = await db.from("clients").select("notify_passengers").eq("id", trip.client_id as string).maybeSingle();
    if (cl && cl.notify_passengers === false) return res;
  }

  const people = tripContacts(trip as never).filter((p) => normalizeWhatsappPhone(p.phone));
  if (!people.length) return res;

  const { data: drv } = await db.from("drivers").select("full_name").eq("id", trip.driver_id as string).maybeSingle();
  const driverName = first(drv?.full_name as string | null) || "seu motorista";
  let vehicle: { model?: string | null; color?: string | null; plate?: string | null } | null = null;
  if (trip.vehicle_id) {
    const { data: v } = await db.from("vehicles").select("model, color, plate").eq("id", trip.vehicle_id as string).maybeSingle();
    vehicle = v ?? null;
  }
  if (!vehicle) vehicle = await resolveDefaultVehicleForDriver(trip.driver_id as string).catch(() => null);
  const car = [vehicle?.model, vehicle?.color ? String(vehicle.color).toLowerCase() : null].filter(Boolean).join(" ") || "Veículo executivo";
  const plate = String(vehicle?.plate ?? "-").toUpperCase();
  const hora = new Date(String(trip.scheduled_at)).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  let token: string | null = null;
  if (kind !== "confirmado") token = (await ensureTripTrackToken(tripId)).token;

  const t = passengerTemplate(kind);
  for (const p of people) {
    const phone = normalizeWhatsappPhone(p.phone) as string;
    const pax = p.name && p.name !== "Passageiro" ? first(p.name) : "tudo bem";
    const params =
      kind === "confirmado"
        ? [pax, dayPhrase(String(trip.scheduled_at)), hora, driverName, car, plate]
        : kind === "a_caminho"
          ? [pax, driverName, place(p.pickup || (trip.origin_text as string)), car, plate]
          : [pax, driverName];
    const preview = renderPassengerTemplate(kind, params, token);

    // Menos mensagens: 1 "confirmado" por pessoa por dia e 1 pedido de avaliação por semana.
    let skipWhy: string | null = null;
    if (kind === "confirmado" || kind === "avaliacao") {
      const since = new Date(Date.now() - (kind === "avaliacao" ? RATING_EVERY_DAYS : 1) * 86400000).toISOString();
      const { count } = await db
        .from("passenger_notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .eq("kind", kind)
        .in("status", ["enviada", "simulada"])
        .neq("trip_id", tripId)
        .gte("created_at", since);
      if ((count ?? 0) > 0) skipWhy = kind === "avaliacao" ? "Já pedimos avaliação a esta pessoa nesta semana" : "Esta pessoa já recebeu a confirmação de outra corrida hoje";
    }

    // Reserva a linha antes de enviar: se outro processo já reservou, não manda de novo.
    const { data: slot } = await db
      .from("passenger_notifications")
      .upsert(
        { tenant_id: tenantId, trip_id: tripId, kind, phone, person_name: p.name, status: "pulada", detail: skipWhy ?? "processando", preview },
        { onConflict: "trip_id,kind,phone", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    if (!slot) continue;
    if (skipWhy) {
      res.skipped++;
      continue;
    }

    if (cfg.mode === "teste" || !cloudReady(cfg)) {
      await db.from("passenger_notifications").update({ status: "simulada", detail: cfg.mode === "teste" ? "Modo teste: não enviado" : "WhatsApp oficial ainda não configurado" }).eq("id", slot.id);
      res.simulated++;
      continue;
    }
    const r = await sendWhatsappTemplate(cfg, phone, t, params, token);
    await db
      .from("passenger_notifications")
      .update(r.ok ? { status: "enviada", detail: null, provider_message_id: r.id } : { status: "falhou", detail: r.error })
      .eq("id", slot.id);
    if (r.ok) res.sent++;
  }
  return res;
}

/** Trocou o motorista: a confirmação pode ir de novo com o motorista e o carro novos. */
export async function resetConfirmationNotice(tripId: string): Promise<void> {
  await db.from("passenger_notifications").delete().eq("trip_id", tripId).eq("kind", "confirmado");
}
