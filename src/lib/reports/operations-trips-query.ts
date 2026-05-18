import { z } from "zod";

const isoDateTimeQueryParam = z.string().max(50).datetime({ offset: true });

export const operationsTripsReportQuerySchema = z.object({
  format: z.enum(["json", "csv", "html"]).default("json"),
  scheduledFrom: isoDateTimeQueryParam.optional(),
  scheduledTo: isoDateTimeQueryParam.optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200)
});

export type OperationsTripsReportQuery = z.infer<typeof operationsTripsReportQuerySchema>;

export function parseOperationsTripsReportQuery(searchParams: URLSearchParams): OperationsTripsReportQuery {
  const query = operationsTripsReportQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  const { scheduledFromIso, scheduledToIso } = operationsTripsReportRange(query);
  if (scheduledFromIso && scheduledToIso && scheduledFromIso > scheduledToIso) {
    throw new Error("scheduledFrom must be before or equal to scheduledTo");
  }
  return query;
}

export function operationsTripsReportRange(query: Pick<OperationsTripsReportQuery, "scheduledFrom" | "scheduledTo">): {
  scheduledFromIso: string | null;
  scheduledToIso: string | null;
} {
  return {
    scheduledFromIso: query.scheduledFrom ? new Date(query.scheduledFrom).toISOString() : null,
    scheduledToIso: query.scheduledTo ? new Date(query.scheduledTo).toISOString() : null
  };
}
