export type FinancialTitleStatus = string | null | undefined;

const LOCKED_STATUSES = new Set(["paid", "cancelled"]);

export function financialTitleBlocksRegeneration(status: FinancialTitleStatus): boolean {
  return typeof status === "string" && LOCKED_STATUSES.has(status);
}

export function financialTitleStatusLabel(status: FinancialTitleStatus): string {
  if (status === "paid") return "pago";
  if (status === "cancelled") return "cancelado";
  return status?.trim() || "desconhecido";
}
