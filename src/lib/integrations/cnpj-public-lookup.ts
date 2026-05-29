/**
 * Consulta CNPJ via Brasil API (pública). Falha graciosamente para preenchimento manual.
 */
export type CnpjLookupResult = {
  cnpj: string;
  legal_name: string | null;
  trade_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  registry_status: string | null;
  main_activity: string | null;
};

function digitsOnly(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export async function lookupCnpjPublic(cnpj: string): Promise<CnpjLookupResult | null> {
  const digits = digitsOnly(cnpj);
  if (digits.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 0 }
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    cnpj?: string;
    razao_social?: string;
    nome_fantasia?: string;
    descricao_situacao_cadastral?: string;
    cnae_fiscal_descricao?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };

  const parts = [data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean);
  const address_line = parts.length ? parts.join(", ") : null;

  return {
    cnpj: digits,
    legal_name: data.razao_social?.trim() || null,
    trade_name: data.nome_fantasia?.trim() || null,
    address_line,
    city: data.municipio?.trim() || null,
    state: data.uf?.trim() || null,
    postal_code: data.cep?.replace(/\D/g, "") || null,
    registry_status: data.descricao_situacao_cadastral?.trim() || null,
    main_activity: data.cnae_fiscal_descricao?.trim() || null
  };
}
