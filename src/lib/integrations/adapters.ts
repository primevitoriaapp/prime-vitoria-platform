import { contaAzulCreateVendaFromReceivable } from "./conta-azul-http";
import { isContaAzulConfigured, isOmieConfigured } from "./erp-mode";
import { omieIncluirContaReceber } from "./omie-http";
import type { Provider, ReceivableDTO } from "./types";

export type { Provider, ReceivableDTO } from "./types";
export { erpIntegrationMode, receivableHasContaAzulVendaFields, receivableHasOmieCliente } from "./erp-mode";

export interface ErpAdapter {
  provider: Provider;
  createReceivable(receivable: ReceivableDTO): Promise<{ externalId: string; externalStatus?: string }>;
}

class ContaAzulAdapter implements ErpAdapter {
  provider: Provider = "conta_azul";

  async createReceivable(receivable: ReceivableDTO): Promise<{ externalId: string; externalStatus?: string }> {
    if (!isContaAzulConfigured()) {
      return { externalId: `ca_mock_${receivable.internalId}`, externalStatus: "mock" };
    }

    const { externalId, externalStatus } = await contaAzulCreateVendaFromReceivable(receivable);
    return { externalId, externalStatus };
  }
}

class OmieAdapter implements ErpAdapter {
  provider: Provider = "omie";

  async createReceivable(receivable: ReceivableDTO): Promise<{ externalId: string; externalStatus?: string }> {
    if (!isOmieConfigured()) {
      return { externalId: `omie_mock_${receivable.internalId}`, externalStatus: "mock" };
    }

    const { externalId, externalStatus } = await omieIncluirContaReceber(receivable);
    return { externalId, externalStatus };
  }
}

export function resolveAdapter(provider: Provider): ErpAdapter {
  if (provider === "conta_azul") {
    return new ContaAzulAdapter();
  }

  return new OmieAdapter();
}
