import { z } from "zod";
import { getClientPricingRule } from "@/lib/clients/client-pricing-rules";
import { getDriverPayoutRule } from "@/lib/drivers/driver-payout-rules";
import { estimatePrimeTripAmounts, primeMarginFromAmounts } from "@/lib/pricing/prime-price-estimate";
import { normalizePrimeServiceType } from "@/lib/pricing/prime-service-types";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const bodySchema = z.object({
  client_id: z.string().uuid(),
  driver_id: z.string().uuid().optional().nullable(),
  service_type: z.string().min(1),
  origin_lat: z.coerce.number().optional().nullable(),
  origin_lng: z.coerce.number().optional().nullable(),
  destination_lat: z.coerce.number().optional().nullable(),
  destination_lng: z.coerce.number().optional().nullable()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());
    const serviceType = normalizePrimeServiceType(body.service_type);

    const clientRule = await getClientPricingRule(body.client_id, tenantId, serviceType);
    if (!clientRule) {
      return fail(
        "PRICING_RULE_NOT_FOUND",
        `Sem tabela de preços para «${serviceType}» neste cliente.`,
        404
      );
    }

    let driver_price_per_km = clientRule.driver_price_per_km;
    let driver_min_km = clientRule.driver_min_km;
    let driver_fixed_price = clientRule.driver_fixed_price;

    if (body.driver_id) {
      const driverRule = await getDriverPayoutRule(body.driver_id, tenantId, serviceType);
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

    return ok({
      service_type: serviceType,
      rule: clientRule,
      estimate,
      margin: primeMarginFromAmounts(estimate.client_amount, estimate.driver_amount)
    });
  } catch (error) {
    return mapApiError(error);
  }
}
