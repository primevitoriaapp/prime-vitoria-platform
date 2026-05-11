export type Provider = "conta_azul" | "omie";

export interface ReceivableDTO {
  internalId: string;
  tripId: string;
  /** UUID interno do cliente (tabela `clients`) */
  clientInternalId: string;
  dueDate: string;
  amount: number;
  description: string;
  externalReference?: string;
  /** Codigo numerico do cliente no Omie (mapeamento ou env). */
  omieCodigoClienteFornecedor?: number;
  /** UUID do cliente na Conta Azul (mapeamento ou env). */
  contaAzulIdCliente?: string;
  /** UUID do item/servico da linha da venda na Conta Azul (mapeamento ou env). */
  contaAzulIdItemServico?: string;
}
