import { z } from "zod";
export { PF_VEHICLE_LIMIT, vehicleLimitFor, cleanPartner } from "./partners-calc.ts";

const opt = z.string().trim().max(200).nullable().optional();

export const partnerSchema = z.object({
  type: z.enum(["PF", "PJ"]),
  name: z.string().trim().min(2).max(160),
  trade_name: opt,
  document: opt,
  phone: opt,
  whatsapp: opt,
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
  pix_key: opt,
  city: opt,
  notes: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().optional()
});

export const partnerVehicleSchema = z.object({
  plate: z.string().trim().min(6).max(10),
  model: z.string().trim().min(2).max(80),
  brand: z.string().trim().max(60).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  model_year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  vehicle_category_id: z.string().uuid().nullable().optional()
});
