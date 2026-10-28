import { db } from "@/lib/server/db";
import { plannedKmFromCoords } from "@/lib/trips/km-distance";
import { bandeiraForIso, priceFromCategoryTable, type PriceCell } from "@/lib/pricing/category-catalog";
import { z } from "zod";
import { getClientPricingRule } from "@/lib/clients/client-pricing-rules";
import { getDriverPayoutRule } from "@/lib/drivers/driver-payout-rules";
import { estimatePrimeTripAmounts, primeMarginFromAmounts } from "@/lib/pricing/prime-price-estimate";
import { resolvePricingServiceType } from "@/lib/pricing/corporativo-bandeira";
import {
  corporativoBandeiraOperatorLabel,
  normalizePrimeServiceType
} from "@/lib/pricing/prime-service-types";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { can } from "@/lib/security/rbac";

const bodySchema = z.object({
  client_id: z.string().uuid(),
  driver_id: z.string().uuid().optional().nullable(),
  service_type: z.string().min(1),
  scheduled_at: z.string().optional(),
  origin_lat: z.coerce.number().optional().nullable(),
  origin_lng: z.coerce.number().optional().nullable(),
  destination_lat: z.coerce.number().optional().nullable(),
  destination_lng: z.coerce.number().optional().nullable(),
  vehicle_category_id: z.string().uuid().optional().nullable(),
  service_mode: z.enum(["transfer", "diaria_5h", "diaria_10h", "diaria_12h", "km"]).optional().nullable()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());

    const isClientPortal = session.role === "cliente" && can(session, "trip.request");
    const isOperator = can(session, "trip.write");

    if (!isClientPortal && !isOperator) {
      return fail("FORBIDDEN", "Sem permissão para estimar valor", 403);
    }

    if (isClientPortal) {
      if (!session.clientId || body.client_id !== session.clientId) {
        return fail("FORBIDDEN", "Não é possível estimar para outro cliente", 403);
      }
    }

    // Tabela nova (veículo × serviço): só o corporativo por km tem estimativa no portal.
    if (body.vehicle_category_id) {
      if (body.service_mode !== "km") return ok({ service_type: body.service_type, has_rule: false, estimate: null });
      const { data: rows } = await db
        .from("client_category_prices")
        .select("service, enabled, client_price, partner_price")
        .eq("client_id", body.client_id)
        .eq("category_id", body.vehicle_category_id);
      const cells: PriceCell[] = (rows ?? []).map((r) => ({
        service: r.service as PriceCell["service"],
        enabled: Boolean(r.enabled),
        client_price: r.client_price == null ? null : Number(r.client_price),
        partner_price: r.partner_price == null ? null : Number(r.partner_price)
      }));
      const km = plannedKmFromCoords({
        origin_lat: body.origin_lat ?? null,
        origin_lng: body.origin_lng ?? null,
        destination_lat: body.destination_lat ?? null,
        destination_lng: body.destination_lng ?? null
      });
      const when = body.scheduled_at ?? new Date().toISOString();
      const price = priceFromCategoryTable({ mode: "km", scheduledAt: when, km, cells });
      const perKm = cells.find((c) => c.service === bandeiraForIso(when) && c.enabled)?.client_price ?? null;
      return ok({
        service_type: body.service_type,
        has_rule: price.client != null,
        charge_type: "per_km",
        price_per_km: perKm,
        estimate: price.client == null ? null : { planned_km: km, client_amount: price.client }
      });
    }

    const uiServiceType = normalizePrimeServiceType(body.service_type);
    const pricingServiceType = resolvePricingServiceType(uiServiceType, body.scheduled_at ?? null);

    const clientRule = await getClientPricingRule(body.client_id, tenantId, pricingServiceType);
    if (!clientRule) {
      return ok({
        service_type: uiServiceType,
        pricing_service_type: pricingServiceType,
        corporativo_bandeira: isOperator
          ? uiServiceType === "corporativo" || pricingServiceType.startsWith("corporativo_")
            ? corporativoBandeiraOperatorLabel(pricingServiceType)
            : null
          : null,
        has_rule: false,
        rule: null,
        estimate: null,
        margin: null
      });
    }

    let driver_price_per_km = clientRule.driver_price_per_km;
    let driver_min_km = clientRule.driver_min_km;
    let driver_fixed_price = clientRule.driver_fixed_price;

    if (body.driver_id && isOperator) {
      const driverRule = await getDriverPayoutRule(body.driver_id, tenantId, pricingServiceType);
      if (driverRule) {
        if (driverRule.charge_type === "per_km") {
          driver_price_per_km = driverRule.price_per_km;
          driver_min_km = driverRule.min_km;
        } else {
          driver_fixed_price = driverRule.fixed_price;
        }
      }
    }

    const estimate = estimatePrimeTripAmounts(
      {
        charge_type: clientRule.charge_type,
        price_per_km: clientRule.price_per_km,
        min_km: clientRule.min_km,
        fixed_price: clientRule.fixed_price,
        driver_price_per_km,
        driver_min_km,
        driver_fixed_price
      },
      {
        origin_lat: body.origin_lat ?? null,
        origin_lng: body.origin_lng ?? null,
        destination_lat: body.destination_lat ?? null,
        destination_lng: body.destination_lng ?? null
      }
    );

    if (isClientPortal) {
      // Portal: só o corporativo (por km) mostra estimativa; transfer e diária a central confirma.
      if (clientRule.charge_type !== "per_km") {
        return ok({ service_type: uiServiceType, has_rule: false, estimate: null });
      }
      return ok({
        service_type: uiServiceType,
        has_rule: true,
        charge_type: clientRule.charge_type,
        price_per_km: clientRule.price_per_km,
        estimate: {
          planned_km: estimate.planned_km,
          client_amount: estimate.client_amount
        }
      });
    }

    return ok({
      service_type: uiServiceType,
      pricing_service_type: pricingServiceType,
      corporativo_bandeira:
        uiServiceType === "corporativo" || pricingServiceType.startsWith("corporativo_")
          ? corporativoBandeiraOperatorLabel(pricingServiceType)
          : null,
      has_rule: true,
      rule: clientRule,
      estimate,
      margin: primeMarginFromAmounts(estimate.client_amount, estimate.driver_amount)
    });
  } catch (error) {
    return mapApiError(error);
  }
}
