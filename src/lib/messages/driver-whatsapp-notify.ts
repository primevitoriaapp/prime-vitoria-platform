import { db } from "@/lib/server/db";
import { normalizeWhatsappPhone } from "@/lib/messages/templates";
import { dayPhrase, passengerTemplate, renderPassengerTemplate, type DriverNotifyKind } from "@/lib/messages/passenger-whatsapp-templates";
import { cloudReady, getWhatsappCloudConfig, sendWhatsappTemplate, sendsLive } from "@/lib/messages/whatsapp-cloud";

/** Mesma alteração repetida em sequência (vários ajustes seguidos): 1 aviso a cada 15 min. */
const CHANGE_COOLDOWN_MIN = 15;

const first = (s?: string | null) => String(s ?? "").trim().split(/\s+/)[0] ?? "";
const place = (a?: string | null) => String(a ?? "").split(",")[0].trim() || "-";

/**
 * WhatsApp ao motorista pelo número oficial (modelo aprovado pela Meta).
 * Sem valores e sem nome da empresa cliente. Nunca lança erro: devolve o que aconteceu.
 */
export async function notifyDriverWhatsapp(
  tenantId: string,
  driverId: string,
  tripId: string,
  kind: DriverNotifyKind
): Promise<{ status: "enviada" | "simulada" | "pulada" | "falhou" | "desligado"; detail?: string }> {
  const cfg = await getWhatsappCloudConfig();
  if (cfg.mode === "desligado") return { status: "desligado" };

  const [{ data: trip }, { data: drv }] = await Promise.all([
    db.from("trips").select("id, scheduled_at, origin_text, destination_text").eq("id", tripId).eq("tenant_id", tenantId).maybeSingle(),
    db.from("drivers").select("full_name, whatsapp, phone").eq("id", driverId).eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (!trip || !drv) return { status: "pulada", detail: "corrida ou motorista não encontrado" };
  const phone = normalizeWhatsappPhone((drv.whatsapp as string | null) || (drv.phone as string | null));

  const hora = new Date(String(trip.scheduled_at)).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const dia = dayPhrase(String(trip.scheduled_at));
  const nome = first(drv.full_name as string | null) || "motorista";
  const params =
    kind === "motorista_nova"
      ? [nome, dia, hora, place(trip.origin_text as string), place(trip.destination_text as string)]
      : [nome, dia, hora, place(trip.origin_text as string)];
  const buttonSuffix = kind === "motorista_cancelada" ? null : tripId;
  const preview = renderPassengerTemplate(kind, params, buttonSuffix);

  // Não repete: nova = 1 vez por corrida/motorista; alterada = 1 a cada 15 min; cancelada = 1 vez.
  let skip: string | null = !phone ? "Motorista sem WhatsApp no cadastro" : null;
  if (!skip) {
    let q = db
      .from("driver_whatsapp_notices")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .eq("driver_id", driverId)
      .eq("kind", kind)
      .in("status", ["enviada", "simulada", "processando"]);
    if (kind === "motorista_alterada") q = q.gte("created_at", new Date(Date.now() - CHANGE_COOLDOWN_MIN * 60000).toISOString());
    const { count } = await q;
    if ((count ?? 0) > 0) skip = kind === "motorista_alterada" ? "Já avisado de uma alteração há pouco" : "Já avisado";
  }
  // Corrida que já passou não gera aviso.
  if (!skip && new Date(String(trip.scheduled_at)).getTime() < Date.now() - 2 * 3600000) skip = "Corrida já passou";

  const live = sendsLive(cfg, "motoristas") && cloudReady(cfg);
  const { data: row } = await db
    .from("driver_whatsapp_notices")
    .insert({ tenant_id: tenantId, trip_id: tripId, driver_id: driverId, kind, phone, preview, status: skip ? "pulada" : live ? "processando" : "simulada", detail: skip ?? (live ? null : "Modo teste: não enviado") })
    .select("id")
    .maybeSingle();
  if (skip) return { status: "pulada", detail: skip };
  if (!row?.id) return { status: "pulada", detail: "Já avisado" };
  if (!live) return { status: "simulada" };

  const r = await sendWhatsappTemplate(cfg, phone as string, passengerTemplate(kind), params, buttonSuffix);
  await db
    .from("driver_whatsapp_notices")
    .update(r.ok ? { status: "enviada", provider_message_id: r.id } : { status: "falhou", detail: r.error })
    .eq("id", row.id);
  return r.ok ? { status: "enviada" } : { status: "falhou", detail: r.error };
}
