import type { ReceivableDTO } from "./types";

const API_BASE = process.env.ERP_CONTA_AZUL_API_BASE_URL ?? "https://api-v2.contaazul.com";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchNextSaleNumber(accessToken: string): Promise<number> {
  const res = await fetch(`${API_BASE}/v1/venda/proximo-numero`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Conta Azul proximo-numero HTTP ${res.status}: ${JSON.stringify(raw)}`);
  }
  const n = (raw as { numero?: number }).numero ?? (raw as { data?: { numero?: number } }).data?.numero;
  if (typeof n !== "number") {
    throw new Error(`Conta Azul proximo-numero unexpected: ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Registra a cobrança como uma Venda (POST /v1/venda), conforme API pública da Conta Azul.
 * `id_cliente` e item podem vir do DTO (mapeamento) ou das variáveis de ambiente.
 */
export async function contaAzulCreateVendaFromReceivable(receivable: ReceivableDTO): Promise<{
  externalId: string;
  externalStatus?: string;
  raw: unknown;
}> {
  const accessToken = requireEnv("ERP_CONTA_AZUL_ACCESS_TOKEN");
  const idCliente = receivable.contaAzulIdCliente ?? process.env.ERP_CONTA_AZUL_ID_CLIENTE;
  const idItem = receivable.contaAzulIdItemServico ?? process.env.ERP_CONTA_AZUL_ID_ITEM_SERVICO;

  if (!idCliente) {
    throw new Error(
      "Conta Azul: defina ERP_CONTA_AZUL_ID_CLIENTE ou mapeamento entity_type=client em erp_entity_mappings para este client_id"
    );
  }
  if (!idItem) {
    throw new Error(
      "Conta Azul: defina ERP_CONTA_AZUL_ID_ITEM_SERVICO ou mapeamento entity_type=conta_azul_item em erp_entity_mappings para este client_id"
    );
  }

  const numero =
    process.env.ERP_CONTA_AZUL_NUMERO_VENDA != null && process.env.ERP_CONTA_AZUL_NUMERO_VENDA !== ""
      ? Number(process.env.ERP_CONTA_AZUL_NUMERO_VENDA)
      : await fetchNextSaleNumber(accessToken);

  const dataVenda = isoDateOnly(new Date());
  const dataVencimento = receivable.dueDate.includes("T") ? receivable.dueDate.slice(0, 10) : receivable.dueDate;

  const payload: Record<string, unknown> = {
    id_cliente: idCliente,
    numero,
    situacao: process.env.ERP_CONTA_AZUL_SITUACAO_VENDA ?? "APROVADO",
    data_venda: dataVenda,
    observacoes: `${receivable.description} | ref:${receivable.externalReference ?? receivable.tripId}`.slice(0, 500),
    itens: [
      {
        id: idItem,
        descricao: receivable.description.slice(0, 120),
        quantidade: 1,
        valor: receivable.amount
      }
    ],
    condicao_pagamento: {
      tipo_pagamento: process.env.ERP_CONTA_AZUL_TIPO_PAGAMENTO ?? "PIX_PAGAMENTO_INSTANTANEO",
      opcao_condicao_pagamento: process.env.ERP_CONTA_AZUL_OPCAO_CONDICAO ?? "À vista",
      parcelas: [
        {
          data_vencimento: dataVencimento,
          valor: receivable.amount,
          descricao: "Parcela 1"
        }
      ]
    }
  };

  if (process.env.ERP_CONTA_AZUL_ID_CATEGORIA) {
    payload.id_categoria = process.env.ERP_CONTA_AZUL_ID_CATEGORIA;
  }
  if (process.env.ERP_CONTA_AZUL_ID_CENTRO_CUSTO) {
    payload.id_centro_custo = process.env.ERP_CONTA_AZUL_ID_CENTRO_CUSTO;
  }
  if (process.env.ERP_CONTA_AZUL_ID_CONTA_FINANCEIRA) {
    (payload.condicao_pagamento as Record<string, unknown>).id_conta_financeira = process.env.ERP_CONTA_AZUL_ID_CONTA_FINANCEIRA;
  }

  const res = await fetch(`${API_BASE}/v1/venda`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Conta Azul venda HTTP ${res.status}: ${JSON.stringify(raw)}`);
  }

  const id = (raw as { id?: string }).id;
  if (!id) {
    throw new Error(`Conta Azul venda unexpected response: ${JSON.stringify(raw)}`);
  }

  const situacaoNome = (raw as { situacao?: { nome?: string } }).situacao?.nome;

  return { externalId: id, externalStatus: situacaoNome, raw };
}
