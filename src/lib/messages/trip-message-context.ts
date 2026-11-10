import { driverPayVisibility } from "@/lib/drivers/driver-pay-visibility";
import { db } from "@/lib/server/db";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";
import { loadEffectiveTemplates } from "@/lib/messages/template-db";
import { presentationAtIso, serviceExtrasLabel } from "@/lib/trips/service-extras";
import { normalizeWhatsappPhone, partnerValueLine, type MessageAudience, type TemplateVars } from "@/lib/messages/templates";

/** Endereço público da plataforma (para links em mensagens): o portal da empresa. */
export function publicAppUrl(): string {
  return OFFICIAL_URLS.empresa;
}

function presentationLine(scheduledAt: string | null | undefined, minutes: number | null | undefined): string {
  if (!scheduledAt) return "";
  const at = presentationAtIso(scheduledAt, minutes);
  return at ? `Chegar no local às ${splitDateTime(at).horario}` : "";
}

export function splitDateTime(iso: string | null | undefined): { data: string; horario: string } {
  const full = formatBrDateTime(iso ?? "");
  const [data, horario] = full.split(/\s+(?:às\s+)?/);
  return { data: data ?? full, horario: horario ?? "" };
}

export type TripMessageContext = {
  trip: Record<string, unknown>;
  base: TemplateVars;
  recipients: Record<MessageAudience, { name: string; phone: string | null }>;
  templates: Awaited<ReturnType<typeof loadEffectiveTemplates>>;
};

/** Dados da corrida para montar as mensagens (variáveis + quem recebe). */
export async function loadTripMessageContext(tenantId: string, tripId: string): Promise<TripMessageContext | null> {
  const { data: trip } = await db.from("trips").select("*").eq("id", tripId).eq("tenant_id", tenantId).maybeSingle();
  if (!trip) return null;

  const [clientRes, driverRes, vehicleRes, requesterRes, templates] = await Promise.all([
    db.from("clients").select("name, trade_name, whatsapp, phone").eq("id", trip.client_id).maybeSingle(),
    trip.driver_id
      ? db.from("drivers").select("full_name, whatsapp, phone, employment_type, partner_id").eq("id", trip.driver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    trip.vehicle_id
      ? db.from("vehicles").select("brand, model, color, plate").eq("id", trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
    trip.created_by
      ? db.from("profiles").select("name, phone, role").eq("id", trip.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    loadEffectiveTemplates(tenantId, trip.client_id as string)
  ]);
  const client = clientRes.data as Record<string, string | null> | null;
  const driver = driverRes.data as Record<string, string | null> | null;
  const vehicle = vehicleRes.data as Record<string, string | null> | null;
  const requester = requesterRes.data as Record<string, string | null> | null;

  const stops = parseTripPickupStops(trip.trip_pickup_stops);
  const passengers = stops.length ? stops.map((s) => s.passenger_name).join(", ") : ((trip.passenger_name as string) ?? "");
  const { data, horario } = splitDateTime(trip.scheduled_at as string);
  const empresa = client?.trade_name || client?.name || "";

  const vis = trip.driver_id ? await driverPayVisibility(String(trip.driver_id)) : null;
  const { data: partner } =
    vis?.reason === "empresa_parceira" && driver?.partner_id
      ? await db.from("partners").select("name, trade_name, whatsapp").eq("id", driver.partner_id).maybeSingle()
      : { data: null };
  const drops = Array.isArray(trip.trip_dropoff_stops) ? (trip.trip_dropoff_stops as Record<string, unknown>[]) : [];
  const paradas = drops
    .map((d, i) => `${d.final ? "🏁 Destino final" : `🔸 Parada ${i + 1}`}: ${String(d.address_text ?? d.address ?? "")}${d.passenger_name ? ` — ${String(d.passenger_name)}` : ""}${d.passenger_phone ? ` (${String(d.passenger_phone)})` : ""}${Number(d.people) > 1 ? ` · ${Number(d.people)} pessoas` : ""}`)
    .filter((l) => l.length > 14)
    .join("\n");
  const pax = Number(trip.passenger_count ?? 1);
  const amount = Number(trip.driver_amount ?? 0);
  const base: TemplateVars = {
    paradas,
    qtd_passageiros: pax > 1 ? `${pax} passageiros` : "",
    valor_parceiro: amount > 0 ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "a combinar",
    passageiro: passengers,
    telefone_passageiro: stops.length ? "" : ((trip.passenger_phone as string) ?? ""),
    empresa,
    numero: String(trip.id).slice(0, 8).toUpperCase(),
    data,
    horario,
    origem: stops.length ? stops.map((s) => s.pickup_text).join(" → ") : ((trip.origin_text as string) ?? ""),
    destino: (trip.destination_text as string) ?? "",
    motorista: driver?.full_name ?? "",
    telefone_motorista: driver?.whatsapp || driver?.phone || "",
    veiculo: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") : "",
    cor: vehicle?.color ?? "",
    placa: vehicle?.plate ?? "",
    apresentacao: presentationLine(trip.scheduled_at as string, trip.presentation_minutes as number | null),
    servicos: serviceExtrasLabel(trip.service_extras as string[] | null),
    voo: trip.flight_number ? `Voo ${String(trip.flight_number)}` : "",
    link_corrida: `${OFFICIAL_URLS.motorista}/driver?trip=${String(trip.id)}`,
    // Na O.S. as marcações e a chegada antecipada vão junto das observações, para o motorista não perder.
    observacoes: [
      presentationLine(trip.scheduled_at as string, trip.presentation_minutes as number | null),
      serviceExtrasLabel(trip.service_extras as string[] | null),
      (trip.notes as string) ?? ""
    ]
      .filter(Boolean)
      .join(" · "),
    linha_valor_parceiro: partnerValueLine(vis?.hidden ? "funcionario" : driver?.employment_type, trip.driver_amount as number | null)
  };

  // Quem pediu: a pessoa do portal (gestor/funcionário); se a central criou, o contato da empresa.
  const requesterIsClient = requester?.role === "cliente";
  const firstName = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] ?? "";
  const recipients: TripMessageContext["recipients"] = {
    passageiro: {
      name: firstName(passengers.split(",")[0]),
      phone: (trip.passenger_phone as string) || stops[0]?.passenger_phone || null
    },
    solicitante: {
      name: requesterIsClient ? firstName(requester?.name) : empresa,
      phone: (requesterIsClient ? requester?.phone : null) || client?.whatsapp || client?.phone || null
    },
    motorista: { name: firstName(driver?.full_name), phone: driver?.whatsapp || driver?.phone || null },
    // Dono do carro (empresa parceira): só existe quando o motorista é de empresa parceira.
    parceiro: { name: partner ? String(partner.trade_name || partner.name || "") : "", phone: partner ? ((partner.whatsapp as string | null) ?? null) : null },
    operador: { name: "", phone: null }
  };

  return { trip, base, recipients, templates };
}

/** Mesmo telefone para quem pediu e passageiro → manda uma mensagem só (para o passageiro). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = normalizeWhatsappPhone(a);
  const pb = normalizeWhatsappPhone(b);
  return Boolean(pa && pb && pa === pb);
}
