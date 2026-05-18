import { closingFinancialAmount } from "./closing-amount.ts";

export function sumFinancialAmounts(rows: Array<{ amount: unknown }> | null | undefined): number {
  return (rows ?? []).reduce((acc, row) => acc + closingFinancialAmount(row.amount), 0);
}
