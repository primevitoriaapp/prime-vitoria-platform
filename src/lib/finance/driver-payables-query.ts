import { z } from "zod";
import { isValidIsoDateOnly } from "../datetime/iso-date-only.ts";

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidIsoDateOnly, "Invalid date");

export const driverPayablesListQuerySchema = z.object({
  status: z.enum(["open", "paid", "cancelled"]).optional(),
  due_from: isoDateOnly.optional(),
  due_to: isoDateOnly.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export type DriverPayablesListQuery = z.infer<typeof driverPayablesListQuerySchema>;

export function parseDriverPayablesListQuery(searchParams: URLSearchParams): DriverPayablesListQuery {
  const query = driverPayablesListQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  if (query.due_from && query.due_to && query.due_to < query.due_from) {
    throw new Error("due_to must be after or equal to due_from");
  }
  return query;
}
