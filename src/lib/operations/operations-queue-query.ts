import { z } from "zod";

export const operationsQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  client_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  scheduled_from: z.string().max(50).optional(),
  scheduled_to: z.string().max(50).optional(),
  unclaimedOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true")
});

export type OperationsQueueQuery = z.infer<typeof operationsQueueQuerySchema>;

export function parseOperationsQueueQuery(searchParams: URLSearchParams): OperationsQueueQuery {
  return operationsQueueQuerySchema.parse(Object.fromEntries(searchParams.entries()));
}
