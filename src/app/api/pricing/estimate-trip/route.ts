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
  destination_lng: z.coerce.number().optional().nullable()
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
