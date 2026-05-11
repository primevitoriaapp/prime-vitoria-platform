import type { Provider, ReceivableDTO } from "./types";

/** Omie: credenciais de API (chamada HTTP possivel). */
export function isOmieConfigured(): boolean {
  return Boolean(process.env.ERP_OMIE_APP_KEY && process.env.ERP_OMIE_APP_SECRET);
}

/** Conta Azul: token Bearer disponivel. */
export function isContaAzulConfigured(): boolean {
  return Boolean(process.env.ERP_CONTA_AZUL_ACCESS_TOKEN);
}

export function erpIntegrationMode(provider: Provider): "live" | "mock" {
  if (provider === "conta_azul") return isContaAzulConfigured() ? "live" : "mock";
  return isOmieConfigured() ? "live" : "mock";
}

/** Cliente Omie resolvido (env global ou campo do DTO / mapeamento). */
export function receivableHasOmieCliente(dto: ReceivableDTO): boolean {
  if (dto.omieCodigoClienteFornecedor != null && Number.isFinite(dto.omieCodigoClienteFornecedor)) return true;
  const v = process.env.ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR;
  return Boolean(v && Number.isFinite(Number(v)));
}

/** Cliente + item Conta Azul resolvidos para POST /v1/venda. */
export function receivableHasContaAzulVendaFields(dto: ReceivableDTO): boolean {
  const idCliente = dto.contaAzulIdCliente ?? process.env.ERP_CONTA_AZUL_ID_CLIENTE;
  const idItem = dto.contaAzulIdItemServico ?? process.env.ERP_CONTA_AZUL_ID_ITEM_SERVICO;
  return Boolean(idCliente && idItem);
}
