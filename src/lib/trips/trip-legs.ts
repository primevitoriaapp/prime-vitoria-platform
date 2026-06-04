import { z } from "zod";

export const tripLegSchema = z.object({
  origin_text: z.string().min(2),
  destination_text: z.string().min(2),
  origin_lat: z.coerce.number().optional().nullable(),
  origin_lng: z.coerce.number().optional().nullable(),
  destination_lat: z.coerce.number().optional().nullable(),
  destination_lng: z.coerce.number().optional().nullable(),
  client_amount: z.coerce.number().nonnegative(),
  driver_amount: z.coerce.number().nonnegative()
});

export type TripLeg = z.infer<typeof tripLegSchema>;

export const tripLegsSchema = z.array(tripLegSchema).min(1).max(12);

export function sumLegAmounts(legs: TripLeg[]): { client_amount: number; driver_amount: number; margin: number } {
  const client_amount = Math.round(legs.reduce((s, l) => s + l.client_amount, 0) * 100) / 100;
  const driver_amount = Math.round(legs.reduce((s, l) => s + l.driver_amount, 0) * 100) / 100;
  const margin = Math.round((client_amount - driver_amount) * 100) / 100;
  return { client_amount, driver_amount, margin };
}
