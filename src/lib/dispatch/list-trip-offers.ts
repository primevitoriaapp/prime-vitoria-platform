import { db } from "@/lib/server/db";
import { attachProfileNamesToDrivers } from "@/lib/vehicles/driver-default-vehicle";

export type OfferResponseRow = {
  driver_id: string;
  status: string;
  eta_minutes: number | null;
  responded_at: string;
  driver?: { id: string; cpf: string; profile_name: string | null };
};

export type TripOfferRow = {
  id: string;
  trip_id: string;
  status: string;
  expires_at: string;
  created_at: string;
  approved_driver_id: string | null;
  responses: OfferResponseRow[];
  recipient_driver_ids: string[];
};

export async function listDispatchOffersForTrip(tripId: string, tenantId: string): Promise<TripOfferRow[]> {
  const { data: offers, error } = await db
    .from("dispatch_offers")
    .select("*")
    .eq("trip_id", tripId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !offers?.length) return [];

  const offerIds = offers.map((o) => o.id);
  const { data: responses } = await db
    .from("dispatch_offer_responses")
    .select("offer_id, driver_id, status, eta_minutes, responded_at")
    .in("offer_id", offerIds);

  const { data: recipients } = await db
    .from("dispatch_offer_recipients")
    .select("offer_id, driver_id")
    .in("offer_id", offerIds);

  const driverIds = [
    ...new Set([
      ...(responses ?? []).map((r) => r.driver_id),
      ...(recipients ?? []).map((r) => r.driver_id),
      ...offers.map((o) => o.approved_driver_id).filter((id): id is string => Boolean(id))
    ])
  ];

  let driversById = new Map<string, { id: string; cpf: string; profile_name: string | null }>();
  if (driverIds.length) {
    const { data: drivers } = await db.from("drivers").select("id, cpf, profile_id").in("id", driverIds);
    const withNames = await attachProfileNamesToDrivers(drivers ?? []);
    driversById = new Map(withNames.map((d) => [d.id, { id: d.id, cpf: d.cpf, profile_name: d.profile_name }]));
  }

  return offers.map((offer) => ({
    id: offer.id,
    trip_id: offer.trip_id,
    status: offer.status,
    expires_at: offer.expires_at,
    created_at: offer.created_at,
    approved_driver_id: offer.approved_driver_id,
    recipient_driver_ids: (recipients ?? []).filter((r) => r.offer_id === offer.id).map((r) => r.driver_id),
    responses: (responses ?? [])
      .filter((r) => r.offer_id === offer.id)
      .map((r) => ({
        driver_id: r.driver_id,
        status: r.status,
        eta_minutes: r.eta_minutes,
        responded_at: r.responded_at,
        driver: driversById.get(r.driver_id)
      }))
  }));
}

export async function listOpenOffersForDriver(driverId: string, tenantId: string) {
  const { data: recipientRows } = await db
    .from("dispatch_offer_recipients")
    .select("offer_id")
    .eq("driver_id", driverId);

  const offerIds = [...new Set((recipientRows ?? []).map((r) => r.offer_id))];
  if (!offerIds.length) return [];

  const { data: offers } = await db
    .from("dispatch_offers")
    .select("id, trip_id, status, expires_at, created_at")
    .in("id", offerIds)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });

  if (!offers?.length) return [];

  const tripIds = [...new Set(offers.map((o) => o.trip_id))];
  const { data: trips } = await db
    .from("trips")
    .select("id, scheduled_at, origin_text, destination_text, passenger_name, operational_status")
    .in("id", tripIds);

  const tripById = new Map((trips ?? []).map((t) => [t.id, t]));

  const { data: myResponses } = await db
    .from("dispatch_offer_responses")
    .select("offer_id, status, eta_minutes")
    .eq("driver_id", driverId)
    .in("offer_id", offers.map((o) => o.id));

  const responseByOffer = new Map((myResponses ?? []).map((r) => [r.offer_id, r]));

  return offers.map((o) => ({
    ...o,
    trip: tripById.get(o.trip_id) ?? null,
    my_response: responseByOffer.get(o.id) ?? null
  }));
}
