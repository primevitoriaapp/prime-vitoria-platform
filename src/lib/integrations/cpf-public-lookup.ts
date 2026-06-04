/**
 * Consulta CPF — validação + lookup opcional (API configurável ou cadastro interno).
 */

export type CpfLookupResult = {
  cpf: string;
  full_name: string | null;
  birth_date?: string | null;
  registry_status?: string | null;
  source: "external" | "internal";
};

export type CpfLookupError = {
  code:
    | "CPF_INVALID"
    | "CPF_NOT_FOUND"
    | "CPF_LOOKUP_TIMEOUT"
    | "CPF_LOOKUP_UNAVAILABLE"
    | "CPF_LOOKUP_NETWORK";
  message: string;
  hint?: string;
};

export type CpfLookupOutcome =
  | { ok: true; data: CpfLookupResult }
  | { ok: false; error: CpfLookupError };

const LOOKUP_TIMEOUT_MS = 12_000;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida 11 dígitos e dígitos verificadores (mod 11). */
export function isValidCpf(cpf: string): boolean {
  const digits = digitsOnly(cpf);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return digits.endsWith(`${d1}${d2}`);
}

type ExternalPayload = {
  nome?: string;
  name?: string;
  full_name?: string;
  nascimento?: string;
  birth_date?: string;
  situacao?: string;
  situacao_cadastral?: string;
};

function mapExternalPayload(data: ExternalPayload, digits: string): CpfLookupResult {
  return {
    cpf: digits,
    full_name: data.nome ?? data.name ?? data.full_name ?? null,
    birth_date: data.nascimento ?? data.birth_date ?? null,
    registry_status: data.situacao ?? data.situacao_cadastral ?? null,
    source: "external"
  };
}

async function lookupExternalCpf(digits: string): Promise<CpfLookupOutcome | null> {
  const token = process.env.CPF_LOOKUP_API_TOKEN?.trim();
  const baseUrl = process.env.CPF_LOOKUP_API_URL?.trim();

  let url: string | null = null;
  if (baseUrl) {
    url = baseUrl.includes("{cpf}") ? baseUrl.replace("{cpf}", digits) : `${baseUrl.replace(/\/$/, "")}/${digits}`;
  } else if (token) {
    url = `https://api.cpfcnpj.com.br/${token}/1/${digits}`;
  }

  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (res.status === 404) {
      return {
        ok: false,
        error: {
          code: "CPF_NOT_FOUND",
          message: "CPF não encontrado na base consultada.",
          hint: "Preencha o nome completo manualmente."
        }
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "CPF_LOOKUP_UNAVAILABLE",
          message: "Serviço de consulta CPF indisponível no momento.",
          hint: "Preencha o nome completo manualmente ou configure CPF_LOOKUP_API_URL."
        }
      };
    }
    const data = (await res.json()) as ExternalPayload;
    const mapped = mapExternalPayload(data, digits);
    if (!mapped.full_name) {
      return {
        ok: false,
        error: {
          code: "CPF_NOT_FOUND",
          message: "Consulta não devolveu nome completo.",
          hint: "Preencha manualmente."
        }
      };
    }
    return { ok: true, data: mapped };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "CPF_LOOKUP_TIMEOUT" : "CPF_LOOKUP_NETWORK",
        message: aborted ? "Consulta CPF excedeu o tempo limite (12s)." : "Falha de rede na consulta CPF.",
        hint: "Preencha o nome completo manualmente."
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupCpfPublic(
  cpf: string,
  internal?: { full_name: string | null; registry_status?: string | null }
): Promise<CpfLookupOutcome> {
  const digits = digitsOnly(cpf);
  if (digits.length !== 11 || !isValidCpf(digits)) {
    return {
      ok: false,
      error: {
        code: "CPF_INVALID",
        message: "CPF inválido — verifique os dígitos.",
        hint: "Corrija o número ou preencha os dados manualmente."
      }
    };
  }

  if (internal?.full_name) {
    return {
      ok: true,
      data: {
        cpf: digits,
        full_name: internal.full_name,
        registry_status: internal.registry_status ?? null,
        source: "internal"
      }
    };
  }

  const external = await lookupExternalCpf(digits);
  if (external) return external;

  return {
    ok: false,
    error: {
      code: "CPF_LOOKUP_UNAVAILABLE",
      message: "Consulta pública de CPF não configurada neste ambiente.",
      hint:
        "Preencha o nome manualmente. Para lookup automático, configure CPF_LOOKUP_API_URL ou CPF_LOOKUP_API_TOKEN (cpfcnpj.com.br)."
    }
  };
}
