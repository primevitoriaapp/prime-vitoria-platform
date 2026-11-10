import { z } from "zod";
import type { DropoffStop } from "./trip-dropoff-stops-core.ts";

export * from "./trip-dropoff-stops-core.ts";

/** Passageiro que embarcou e onde desce (lista exigida por algumas empresas, ex.: Comexport). */
export const dropoffStopSchema = z.object({
  passenger_id: z.string().uuid().nullable().optional(),
  passenger_name: z.string().trim().max(120).default(""),
  passenger_phone: z.string().trim().max(40).nullable().optional(),
  address_text: z.string().trim().min(3).max(300),
  lat: z.coerce.number().nullable().optional(),
  lng: z.coerce.number().nullable().optional(),
  people: z.coerce.number().int().min(1).max(60).nullable().optional(),
  dropped_at: z.string().nullable().optional(),
  final: z.boolean().nullable().optional()
});


export const dropoffStopsSchema = z.array(dropoffStopSchema).min(1).max(30);

export function parseDropoffStops(raw: unknown): DropoffStop[] {
  if (!Array.isArray(raw) || !raw.length) return [];
  const p = dropoffStopsSchema.safeParse(raw);
  return p.success ? p.data : [];
}

