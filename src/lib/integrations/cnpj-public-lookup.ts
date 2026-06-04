/**
 * Consulta CNPJ via Brasil API (pública).
 * Timeout, erros explícitos e validação de dígitos verificadores.
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

export type CnpjLookupError = {
  code:
    | "CNPJ_INVALID"
    | "CNPJ_NOT_FOUND"
    | "CNPJ_LOOKUP_TIMEOUT"
    | "CNPJ_LOOKUP_RATE_LIMIT"
    | "CNPJ_LOOKUP_UNAVAILABLE"
    | "CNPJ_LOOKUP_NETWORK";
  message: string;
  hint?: string;
};

export type CnpjLookupOutcome =
  | { ok: true; data: CnpjLookupResult }
  | { ok: false; error: CnpjLookupError };

const BRASIL_API_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1";
const LOOKUP_TIMEOUT_MS = 12_000;

function digitsOnly(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/** Valida 14 dígitos e dígitos verificadores (mod 11). */
export function isValidCnpj(cnpj: string): boolean {
  const digits = digitsOnly(cnpj);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;

  const calcCheck = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const base12 = digits.slice(0, 12);
  const d1 = calcCheck(base12, w1);
  const d2 = calcCheck(base12 + d1, w2);
  return digits.endsWith(`${d1}${d2}`);
}

type BrasilApiCnpjPayload = {
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
  cep?: string | number;
};

export function mapBrasilApiCnpjPayload(data: BrasilApiCnpjPayload, digits: string): CnpjLookupResult {
  const parts = [data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean);
  const cepRaw = data.cep != null ? String(data.cep) : "";

  return {
    cnpj: digitsOnly(data.cnpj ?? digits),
    legal_name: data.razao_social?.trim() || null,
    trade_name: data.nome_fantasia?.trim() || null,
    address_line: parts.length ? parts.join(", ") : null,
    city: data.municipio?.trim() || null,
    state: data.uf?.trim()?.toUpperCase() || null,
    postal_code: cepRaw.replace(/\D/g, "") || null,
    registry_status: data.descricao_situacao_cadastral?.trim() || null,
    main_activity: data.cnae_fiscal_descricao?.trim() || null
  };
}

async function fetchBrasilApiCnpj(digits: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    return await fetch(`${BRASIL_API_CNPJ_URL}/${digits}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "PrimeVitoria-Platform/1.0 (+cadastro-cliente)"
      },
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupCnpjPublic(cnpj: string): Promise<CnpjLookupOutcome> {
  const digits = digitsOnly(cnpj);

  if (digits.length !== 14) {
    return {
      ok: false,
      error: {
        code: "CNPJ_INVALID",
        message: "CNPJ inválido — informe 14 dígitos.",
        hint: "Use apenas números ou formato 00.000.000/0000-00."
      }
    };
  }

  if (!isValidCnpj(digits)) {
    return {
      ok: false,
      error: {
        code: "CNPJ_INVALID",
        message: "CNPJ inválido — dígitos verificadores incorrectos.",
        hint: "Confira o número ou preencha os dados manualmente."
      }
    };
  }

  let res: Response;
  try {
    res = await fetchBrasilApiCnpj(digits);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "CNPJ_LOOKUP_TIMEOUT" : "CNPJ_LOOKUP_NETWORK",
        message: aborted
          ? "Consulta CNPJ expirou (timeout). Tente novamente ou preencha manualmente."
          : "Falha de rede ao consultar CNPJ. Verifique ligação ou preencha manualmente.",
        hint: aborted ? `Limite de ${LOOKUP_TIMEOUT_MS / 1000}s por consulta.` : undefined
      }
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      error: {
        code: "CNPJ_NOT_FOUND",
        message: "CNPJ não encontrado na base pública.",
        hint: "Verifique se o número está correcto ou cadastre manualmente."
      }
    };
  }

  if (res.status === 429) {
    return {
      ok: false,
      error: {
        code: "CNPJ_LOOKUP_RATE_LIMIT",
        message: "Consulta CNPJ temporariamente indisponível (limite da API).",
        hint: "Aguarde cerca de 1 minuto e tente de novo, ou preencha manualmente."
      }
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        code: "CNPJ_LOOKUP_UNAVAILABLE",
        message: `Serviço de consulta CNPJ indisponível (HTTP ${res.status}).`,
        hint: "Preencha razão social e endereço manualmente."
      }
    };
  }

  let data: BrasilApiCnpjPayload;
  try {
    data = (await res.json()) as BrasilApiCnpjPayload;
  } catch {
    return {
      ok: false,
      error: {
        code: "CNPJ_LOOKUP_UNAVAILABLE",
        message: "Resposta inválida do serviço de CNPJ.",
        hint: "Preencha manualmente."
      }
    };
  }

  const mapped = mapBrasilApiCnpjPayload(data, digits);
  if (!mapped.legal_name && !mapped.trade_name) {
    return {
      ok: false,
      error: {
        code: "CNPJ_NOT_FOUND",
        message: "CNPJ encontrado, mas sem razão social — preencha manualmente.",
        hint: "A API pública pode estar incompleta para este registo."
      }
    };
  }

  return { ok: true, data: mapped };
}
