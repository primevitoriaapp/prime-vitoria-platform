import { z } from "zod";

export const financialMarkPaidBodySchema = z.object({
  payment_method: z.string().min(1).max(80),
  paid_at: z.string().max(50).datetime({ offset: true }).optional(),
  reference: z.string().max(120).optional()
});

export type FinancialMarkPaidBody = z.infer<typeof financialMarkPaidBodySchema>;

export function financialPaidAt(body: Pick<FinancialMarkPaidBody, "paid_at">, reference = new Date()): string {
  return body.paid_at ?? reference.toISOString();
}
