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
/** Passageiro recorrente (3+ avisos em 14 dias): avaliação no máximo 1 vez por mês. */
const RATING_EVERY_DAYS_RECURRING = 30;
/** Janela para considerar "mesmo motorista de sempre". */
const HABIT_DAYS = 7;

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
    const { data: cl } = await db.from("clients").select("notify_passengers, notify_mode").eq("id", trip.client_id as string).maybeSingle();
    if (cl && cl.notify_passengers === false) return res;
    // Rota fixa diária: só o "a caminho" (com o link para acompanhar).
    if (cl?.notify_mode === "so_a_caminho" && kind !== "a_caminho") return res;
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

    // Menos mensagens:
    // - "confirmado": 1 por pessoa por dia; e passageiro recorrente com o MESMO motorista não recebe (só quando o motorista muda).
    // - "avaliação": 1 por semana; para recorrente, 1 por mês.
    let skipWhy: string | null = null;
    if (kind === "confirmado") {
      const { data: last } = await db
        .from("passenger_notifications")
        .select("driver_id, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .eq("kind", "confirmado")
        .neq("trip_id", tripId)
        .gte("created_at", new Date(Date.now() - HABIT_DAYS * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const sentToday = (last ?? []).some(
        (r) => ["enviada", "simulada"].includes(String(r.status)) && new Date(String(r.created_at)).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === today
      );
      const prev = (last ?? [])[0];
      if (sentToday) skipWhy = "Esta pessoa já recebeu a confirmação de outra corrida hoje";
      else if (prev?.driver_id && prev.driver_id === trip.driver_id) skipWhy = "Passageiro recorrente com o mesmo motorista (avisamos só quando o motorista mudar)";
    } else if (kind === "avaliacao") {
      const { count: recent } = await db
        .from("passenger_notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString());
      const days = (recent ?? 0) >= 3 ? RATING_EVERY_DAYS_RECURRING : RATING_EVERY_DAYS;
      const { count } = await db
        .from("passenger_notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .eq("kind", "avaliacao")
        .in("status", ["enviada", "simulada"])
        .neq("trip_id", tripId)
        .gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
      if ((count ?? 0) > 0) skipWhy = days === RATING_EVERY_DAYS ? "Já pedimos avaliação a esta pessoa nesta semana" : "Passageiro recorrente: pedimos avaliação no máximo 1 vez por mês";
    }

    // Reserva a linha antes de enviar: se outro processo já reservou, não manda de novo.
    const { data: slot } = await db
      .from("passenger_notifications")
      .upsert(
        { tenant_id: tenantId, trip_id: tripId, kind, phone, person_name: p.name, status: "pulada", detail: skipWhy ?? "processando", preview, driver_id: trip.driver_id },
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
