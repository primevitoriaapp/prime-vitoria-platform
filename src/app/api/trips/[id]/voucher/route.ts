import { db } from "@/lib/server/db";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { fail, mapApiError } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { tripVoucherHtml } from "@/lib/reports/trip-voucher-html";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { enrichTripListItems } from "@/lib/trips/enrich-trip-list";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    assertCapability(session, "trip.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: trip, error } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (error || !trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(
        session,
        {
          client_id: trip.client_id,
          driver_id: trip.driver_id ?? null,
          tenant_id: trip.tenant_id
        },
        session.driverId
      )
    );
    if (denied) return denied;

    const [enriched] = await enrichTripListItems([trip]);
    const company = await getTenantCompanyProfile(tenantId);

    let vehicleLabel: string | null = null;
    if (trip.vehicle_id) {
      const { data: vehicle } = await db
        .from("vehicles")
        .select("plate, model")
        .eq("id", trip.vehicle_id)
        .maybeSingle();
      if (vehicle) {
        vehicleLabel = `${vehicle.plate} · ${vehicle.model}`;
      }
    }

    const html = tripVoucherHtml(company, {
      tripId: trip.id as string,
      clientName: enriched?.client_name ?? "—",
      passengerName: (trip.passenger_name as string | null)?.trim() || "—",
      originText: String(trip.origin_text ?? "—"),
      destinationText: String(trip.destination_text ?? "—"),
      scheduledAt: String(trip.scheduled_at),
      driverName: enriched?.driver_name ?? null,
      vehicleLabel,
      clientAmount: trip.client_amount != null ? Number(trip.client_amount) : null,
      serviceLabel: trip.service_type
        ? primeServiceTypeLabel(String(trip.service_type), {
            audience: "operator",
            scheduledAt: String(trip.scheduled_at)
          })
        : null
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return mapApiError(error);
  }
}
