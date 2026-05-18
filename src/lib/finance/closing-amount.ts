export function closingFinancialAmount(value: unknown): number {
  if (value == null) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}
