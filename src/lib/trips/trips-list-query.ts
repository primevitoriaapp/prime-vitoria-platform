import { z } from "zod";

const isoDateTimeQueryParam = z.string().max(50).datetime({ offset: true });

export const tripsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  driverId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  scheduledFrom: isoDateTimeQueryParam.optional(),
  scheduledTo: isoDateTimeQueryParam.optional()
});

export type TripsListQuery = z.infer<typeof tripsListQuerySchema>;

export function parseTripsListQuery(searchParams: URLSearchParams): TripsListQuery {
  const query = tripsListQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  const { scheduledFromIso, scheduledToIso } = tripsListQueryRange(query);
  if (scheduledFromIso && scheduledToIso && scheduledFromIso > scheduledToIso) {
    throw new Error("scheduledFrom must be before or equal to scheduledTo");
  }
  return query;
}

export function tripsListQueryRange(query: Pick<TripsListQuery, "scheduledFrom" | "scheduledTo">): {
  scheduledFromIso: string | null;
  scheduledToIso: string | null;
} {
  return {
    scheduledFromIso: query.scheduledFrom ? new Date(query.scheduledFrom).toISOString() : null,
    scheduledToIso: query.scheduledTo ? new Date(query.scheduledTo).toISOString() : null
  };
}
