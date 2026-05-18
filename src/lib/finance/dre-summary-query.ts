import { z } from "zod";
import { isValidIsoDateOnly } from "../datetime/iso-date-only.ts";

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidIsoDateOnly, "Invalid date");

export const dreSummaryQuerySchema = z.object({
  format: z.enum(["json", "html"]).default("json"),
  period_start: isoDateOnly,
  period_end: isoDateOnly
});

export type DreSummaryQuery = z.infer<typeof dreSummaryQuerySchema>;

export function parseDreSummaryQuery(searchParams: URLSearchParams): DreSummaryQuery {
  const query = dreSummaryQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  if (query.period_end < query.period_start) {
    throw new Error("period_end must be after or equal to period_start");
  }
  return query;
}
