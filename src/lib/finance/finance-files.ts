/** Anexos do financeiro. */
export const FINANCE_FILE_KINDS = {
  boleto: "Boleto",
  comprovante: "Comprovante de pagamento",
  nota: "Nota fiscal",
  outro: "Outro"
} as const;
export type FinanceFileKind = keyof typeof FINANCE_FILE_KINDS;
export const FINANCE_ENTITY_TYPES = ["company_payable", "other_income"] as const;
export type FinanceEntityType = (typeof FINANCE_ENTITY_TYPES)[number];
export type FinanceFile = { id: string; entity_id: string; kind: string; file_name: string; size_bytes: number | null; created_at: string };
