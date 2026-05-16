import { z } from "zod";

export const OPERATIONS_HISTORY_STATUSES = ["completed", "cancelled", "no_show", "rejected"] as const;

export const operationsHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  days: z.coerce.number().int().min(1).max(90).default(14),
  client_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  status: z.enum(["completed", "cancelled", "no_show", "rejected"]).optional(),
  scheduled_to: z.string().max(50).optional(),
  format: z.enum(["json", "csv"]).default("json")
});

export type OperationsHistoryQuery = z.infer<typeof operationsHistoryQuerySchema>;

export function parseOperationsHistoryQuery(searchParams: URLSearchParams): OperationsHistoryQuery {
  return operationsHistoryQuerySchema.parse(Object.fromEntries(searchParams.entries()));
}
