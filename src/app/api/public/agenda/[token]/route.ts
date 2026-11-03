import { db } from "@/lib/server/db";
import { getClientIp } from "@/lib/security/integration-guard";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { buildCalendarFeed, normalizeFeedToken, type FeedTrip } from "@/lib/integrations/calendar-feed";
import { tenantForFeedToken } from "@/lib/integrations/calendar-feed-store";
import { enrichTripListItems } from "@/lib/trips/enrich-trip-list";

export const dynamic = "force-dynamic";

/** Agenda da Prime (.ics) para assinar no Google Agenda / iPhone. Link secreto, sem valores. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    enforceRateLimit(`agenda-feed:${getClientIp(request) ?? "unknown"}`, 30, 60_000);
  } catch {
    return new Response("Muitas consultas", { status: 429 });
  }
  const { token: raw } = await params;
  const token = normalizeFeedToken(raw);
  if (!token) return new Response("Link inválido", { status: 404 });
  const tenantId = await tenantForFeedToken(token);
  if (!tenantId) return new Response("Link inválido ou trocado", { status: 404 });

  const from = new Date(Date.now() - 14 * 86400_000).toISOString();
  const to = new Date(Date.now() + 90 * 86400_000).toISOString();
  const { data, error } = await db
    .from("trips")
    .select(
      "id, client_id, driver_id, vehicle_id, created_by, scheduled_at, service_type, operational_status, origin_text, destination_text, passenger_name, passenger_count, passenger_phone, flight_number, presentation_minutes, notes, flight_eta, flight_delay_minutes"
    )
    .eq("tenant_id", tenantId)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .not("operational_status", "in", "(cancelled,rejected)")
    .order("scheduled_at", { ascending: true })
    .limit(1000);
  if (error) return new Response("Erro ao montar a agenda", { status: 500 });

  const items = await enrichTripListItems((data ?? []) as Parameters<typeof enrichTripListItems>[0]);
  const trips: FeedTrip[] = items.map((t) => {
    const r = t as typeof t & FeedTrip & { vehicle?: { model: string; plate: string } | null };
    return { ...r, vehicle: r.vehicle ? `${r.vehicle.model} ${r.vehicle.plate}` : null };
  });
  const body = buildCalendarFeed(trips, { appUrl: new URL(request.url).origin });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="prime-vitoria.ics"',
      "cache-control": "no-store",
      "x-robots-tag": "noindex"
    }
  });
}
