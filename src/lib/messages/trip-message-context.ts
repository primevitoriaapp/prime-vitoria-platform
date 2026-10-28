import { db } from "@/lib/server/db";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";
import { loadEffectiveTemplates } from "@/lib/messages/template-db";
import { normalizeWhatsappPhone, partnerValueLine, type MessageAudience, type TemplateVars } from "@/lib/messages/templates";

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
      ? db.from("drivers").select("full_name, whatsapp, phone, employment_type").eq("id", trip.driver_id).maybeSingle()
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

  const base: TemplateVars = {
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
    observacoes: (trip.notes as string) ?? "",
    linha_valor_parceiro: partnerValueLine(driver?.employment_type, trip.driver_amount as number | null)
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
