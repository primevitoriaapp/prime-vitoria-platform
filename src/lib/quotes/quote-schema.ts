import { z } from "zod";

const money = z.union([z.number(), z.string(), z.null()]).transform((v) => {
  if (v === null || v === "") return null;
  const t = String(v).trim();
  const n = typeof v === "number" ? v : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
});

export const quoteItemSchema = z.object({
  vehicle_category_id: z.string().uuid().nullable().optional(),
  service_mode: z.enum(["transfer", "diaria_5h", "diaria_10h", "diaria_12h", "km", "outro"]).default("transfer"),
  description: z.string().trim().max(500).nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  origin_text: z.string().trim().max(300).nullable().optional(),
  origin_lat: z.number().nullable().optional(),
  origin_lng: z.number().nullable().optional(),
  destination_text: z.string().trim().max(300).nullable().optional(),
  destination_lat: z.number().nullable().optional(),
  destination_lng: z.number().nullable().optional(),
  passenger_count: z.coerce.number().int().min(1).max(80).default(1),
  passenger_name: z.string().trim().max(200).nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  unit_price: money.transform((v) => v ?? 0),
  driver_amount: money
});

export const quoteSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  contact_type: z.enum(["PF", "PJ"]).default("PJ"),
  contact_name: z.string().trim().max(200).nullable().optional(),
  contact_document: z.string().trim().max(30).nullable().optional(),
  contact_phone: z.string().trim().max(40).nullable().optional(),
  contact_email: z.string().trim().max(200).nullable().optional(),
  issuer: z.enum(["rj_prime", "prime_servicos", "ilha_prime"]).nullable().optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  discount: money.transform((v) => v ?? 0),
  notes: z.string().trim().max(2000).nullable().optional(),
  conditions: z.string().trim().max(3000).nullable().optional(),
  items: z.array(quoteItemSchema).min(1).max(60)
});

export type QuoteInput = z.infer<typeof quoteSchema>;
