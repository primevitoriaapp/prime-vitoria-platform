import type { ReceivableDTO } from "./types";

/** Converte data ISO ou YYYY-MM-DD para DD/MM/YYYY (UTC) para API Omie. */
export function formatOmieDate(isoOrDateString: string): string {
  const d = new Date(isoOrDateString.length === 10 ? `${isoOrDateString}T12:00:00.000Z` : isoOrDateString);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid due date for Omie: ${isoOrDateString}`);
  }
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const OMIE_API_URL = process.env.ERP_OMIE_API_URL ?? "https://app.omie.com.br/api/v1/financas/contareceber/";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optionalNumber(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function omieIncluirContaReceber(receivable: ReceivableDTO): Promise<{ externalId: string; externalStatus?: string; raw: unknown }> {
  const appKey = requireEnv("ERP_OMIE_APP_KEY");
  const appSecret = requireEnv("ERP_OMIE_APP_SECRET");
  const codigoCliente = receivable.omieCodigoClienteFornecedor ?? optionalNumber("ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR");
  if (codigoCliente === undefined) {
    throw new Error(
      "Omie: defina ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR ou cadastre mapeamento entity_type=client em erp_entity_mappings para este client_id"
    );
  }

  const codigoCategoria = process.env.ERP_OMIE_CODIGO_CATEGORIA;
  const idContaCorrente = optionalNumber("ERP_OMIE_ID_CONTA_CORRENTE");

  const codigoLancamentoIntegracao = `PV-${receivable.internalId}`.slice(0, 60);

  const conta: Record<string, unknown> = {
    codigo_lancamento_integracao: codigoLancamentoIntegracao,
    codigo_cliente_fornecedor: codigoCliente,
    data_vencimento: formatOmieDate(receivable.dueDate),
    data_previsao: formatOmieDate(receivable.dueDate),
    valor_documento: receivable.amount,
    observacao: receivable.description.slice(0, 500)
  };

  if (codigoCategoria) conta.codigo_categoria = codigoCategoria;
  if (idContaCorrente !== undefined) conta.id_conta_corrente = idContaCorrente;

  const body = {
    call: "IncluirContaReceber",
    app_key: appKey,
    app_secret: appSecret,
    param: [conta]
  };

  const res = await fetch(OMIE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const raw = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    throw new Error(`Omie HTTP ${res.status}: ${JSON.stringify(raw)}`);
  }

  const faultString =
    typeof raw.faultstring === "string"
      ? raw.faultstring
      : typeof (raw as { fault?: { faultstring?: string } }).fault?.faultstring === "string"
        ? (raw as { fault: { faultstring: string } }).fault.faultstring
        : null;

  if (faultString) {
    throw new Error(`Omie fault: ${faultString}`);
  }

  const nested = (raw as { conta_receber_cadastro_response?: { codigo_lancamento_omie?: number | string } })
    .conta_receber_cadastro_response;

  const codigo =
    nested?.codigo_lancamento_omie ??
    (raw as { codigo_lancamento_omie?: number | string }).codigo_lancamento_omie;

  const descricaoStatus =
    (nested as { descricao_status?: string } | undefined)?.descricao_status ??
    (raw as { descricao_status?: string }).descricao_status;

  if (codigo === undefined || codigo === null) {
    throw new Error(`Omie unexpected response: ${JSON.stringify(raw)}`);
  }

  return {
    externalId: String(codigo),
    externalStatus: descricaoStatus,
    raw
  };
}
