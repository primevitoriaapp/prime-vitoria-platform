import { z } from "zod";

export const pricingCalculationTypeSchema = z.enum([
  "fixed_price",
  "km_with_minimum",
  "daily_rate",
  "hourly_plus_extra",
  "event_package",
  "custom"
]);

export const pricingRuleBodySchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(2).max(120).default("Regra padrão"),
  calculation_type: pricingCalculationTypeSchema,
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  fixed_price: z.number().nonnegative().optional().nullable(),
  price_per_km: z.number().nonnegative().optional().nullable(),
  minimum_km: z.number().nonnegative().optional().nullable(),
  minimum_value: z.number().nonnegative().optional().nullable(),
  included_hours: z.number().nonnegative().optional().nullable(),
  extra_hour_value: z.number().nonnegative().optional().nullable(),
  included_km: z.number().nonnegative().optional().nullable(),
  extra_km_value: z.number().nonnegative().optional().nullable(),
  night_fee: z.number().nonnegative().optional().nullable(),
  holiday_fee: z.number().nonnegative().optional().nullable(),
  toll_policy: z.enum(["client", "company", "split"]).optional().nullable(),
  parking_policy: z.enum(["client", "company", "split"]).optional().nullable(),
  settings: z.record(z.unknown()).optional().default({})
});

export const pricingRulePatchSchema = pricingRuleBodySchema.partial().omit({ client_id: true });

export const pricingRulesListSchema = z.object({
  client_id: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});
