import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";
import { loadEffectiveTemplates } from "@/lib/messages/template-db";
import {
  AUDIENCE_LABEL,
  MESSAGE_EVENTS,
  partnerValueLine,
  renderTemplate,
  whatsappLink,
  type MessageAudience
} from "@/lib/messages/templates";

function splitDateTime(iso: string | null | undefined): { data: string; horario: string } {
  const full = formatBrDateTime(iso ?? "");
  const [data, horario] = full.split(/\s+(?:às\s+)?/);
  return { data: data ?? full, horario: horario ?? "" };
}

/** Mensagens prontas desta corrida (texto + link do WhatsApp) para a central enviar. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);

    const [clientRes, driverRes, vehicleRes, templates] = await Promise.all([
      db.from("clients").select("name, trade_name, whatsapp, phone").eq("id", trip.client_id).maybeSingle(),
      trip.driver_id
        ? db.from("drivers").select("full_name, whatsapp, phone, employment_type").eq("id", trip.driver_id).maybeSingle()
        : Promise.resolve({ data: null }),
      trip.vehicle_id
        ? db.from("vehicles").select("brand, model, color, plate").eq("id", trip.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
      loadEffectiveTemplates(tenantId, trip.client_id as string)
    ]);
    const client = clientRes.data as Record<string, string | null> | null;
    const driver = driverRes.data as Record<string, string | null> | null;
    const vehicle = vehicleRes.data as Record<string, string | null> | null;

    const stops = parseTripPickupStops(trip.trip_pickup_stops);
    const passengers = stops.length ? stops.map((s) => s.passenger_name).join(", ") : ((trip.passenger_name as string) ?? "");
    const { data, horario } = splitDateTime(trip.scheduled_at as string);
    const empresa = client?.trade_name || client?.name || "";

    const base = {
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

    const recipients: Record<MessageAudience, { name: string; phone: string | null }> = {
      passageiro: { name: passengers.split(",")[0]?.trim() || "", phone: (trip.passenger_phone as string) || stops[0]?.passenger_phone || null },
      solicitante: { name: empresa, phone: client?.whatsapp || client?.phone || null },
      motorista: { name: driver?.full_name?.split(" ")[0] ?? "", phone: driver?.whatsapp || driver?.phone || null },
      operador: { name: "", phone: null }
    };

    const messages = templates
      .filter((t) => t.audience !== "operador")
      .map((t) => {
        const r = recipients[t.audience];
        const text = renderTemplate(t.body, { ...base, nome: r.name });
        const ev = MESSAGE_EVENTS.find((e) => e.id === t.event);
        return {
          event: t.event,
          event_label: ev?.label ?? t.event,
          audience: t.audience,
          audience_label: AUDIENCE_LABEL[t.audience],
          text,
          phone: r.phone,
          whatsapp_url: whatsappLink(r.phone, text)
        };
      });

    return ok(messages);
  } catch (error) {
    return mapApiError(error);
  }
}
