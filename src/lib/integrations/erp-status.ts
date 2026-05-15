import type { Provider } from "./types.ts";
import { erpIntegrationMode, isContaAzulConfigured, isOmieConfigured } from "./erp-mode.ts";

export type ErpProviderStatus = {
  provider: Provider;
  mode: "live" | "mock";
  credentials: Record<string, boolean>;
  ready_for_sync: boolean;
  missing: string[];
};

export type ErpIntegrationStatus = {
  providers: ErpProviderStatus[];
  webhooks: {
    omie_secret: boolean;
    conta_azul_secret: boolean;
    generic_secret: boolean;
  };
  job_secrets: {
    erp_process: boolean;
    reconcile: boolean;
  };
};

function omieStatus(): ErpProviderStatus {
  const mode = erpIntegrationMode("omie");
  const missing: string[] = [];
  if (!process.env.ERP_OMIE_APP_KEY) missing.push("ERP_OMIE_APP_KEY");
  if (!process.env.ERP_OMIE_APP_SECRET) missing.push("ERP_OMIE_APP_SECRET");
  const hasGlobalCliente = Boolean(process.env.ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR?.trim());
  if (mode === "live" && !hasGlobalCliente) {
    missing.push("ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR (ou mapeamento client por internal_id)");
  }
  return {
    provider: "omie",
    mode,
    credentials: {
      app_key: Boolean(process.env.ERP_OMIE_APP_KEY),
      app_secret: Boolean(process.env.ERP_OMIE_APP_SECRET),
      codigo_cliente_global: hasGlobalCliente
    },
    ready_for_sync: mode === "mock" || (isOmieConfigured() && hasGlobalCliente),
    missing
  };
}

function contaAzulStatus(): ErpProviderStatus {
  const mode = erpIntegrationMode("conta_azul");
  const missing: string[] = [];
  if (!process.env.ERP_CONTA_AZUL_ACCESS_TOKEN) missing.push("ERP_CONTA_AZUL_ACCESS_TOKEN");
  const hasCliente = Boolean(process.env.ERP_CONTA_AZUL_ID_CLIENTE?.trim());
  const hasItem = Boolean(process.env.ERP_CONTA_AZUL_ID_ITEM_SERVICO?.trim());
  if (mode === "live" && !hasCliente) {
    missing.push("ERP_CONTA_AZUL_ID_CLIENTE (ou mapeamento client)");
  }
  if (mode === "live" && !hasItem) {
    missing.push("ERP_CONTA_AZUL_ID_ITEM_SERVICO (ou mapeamento conta_azul_item)");
  }
  return {
    provider: "conta_azul",
    mode,
    credentials: {
      access_token: isContaAzulConfigured(),
      id_cliente: hasCliente,
      id_item_servico: hasItem
    },
    ready_for_sync: mode === "mock" || (isContaAzulConfigured() && hasCliente && hasItem),
    missing
  };
}

export function buildErpIntegrationStatus(): ErpIntegrationStatus {
  return {
    providers: [omieStatus(), contaAzulStatus()],
    webhooks: {
      omie_secret: Boolean(process.env.ERP_OMIE_WEBHOOK_SECRET?.trim()),
      conta_azul_secret: Boolean(process.env.ERP_CONTA_AZUL_WEBHOOK_SECRET?.trim()),
      generic_secret: Boolean(process.env.ERP_WEBHOOK_SECRET?.trim())
    },
    job_secrets: {
      erp_process: Boolean(process.env.ERP_JOB_PROCESS_SECRET?.trim()),
      reconcile: Boolean(process.env.RECONCILE_JOB_PROCESS_SECRET?.trim())
    }
  };
}
