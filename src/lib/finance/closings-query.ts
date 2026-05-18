import { z } from "zod";
import { isValidIsoDateOnly } from "../datetime/iso-date-only.ts";

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidIsoDateOnly, "Invalid date");

export const financeClosingsListQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  period_start: isoDateOnly.optional(),
  period_end: isoDateOnly.optional(),
  status: z.enum(["draft", "closed", "reopened"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50)
});

export type FinanceClosingsListQuery = z.infer<typeof financeClosingsListQuerySchema>;

export function parseFinanceClosingsListQuery(searchParams: URLSearchParams): FinanceClosingsListQuery {
  const query = financeClosingsListQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  if (query.period_start && query.period_end && query.period_end < query.period_start) {
    throw new Error("period_end must be after or equal to period_start");
  }
  return query;
}

