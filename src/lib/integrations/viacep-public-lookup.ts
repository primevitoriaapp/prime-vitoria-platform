/**
 * Consulta CEP via ViaCEP (pública).
 */

export type ViaCepLookupResult = {
  postal_code: string;
  address_line: string;
  district: string;
  city: string;
  state: string;
};

export type ViaCepLookupError = {
  code: "CEP_INVALID" | "CEP_NOT_FOUND" | "CEP_LOOKUP_NETWORK" | "CEP_LOOKUP_UNAVAILABLE";
  message: string;
  hint?: string;
};

export type ViaCepLookupOutcome =
  | { ok: true; data: ViaCepLookupResult }
  | { ok: false; error: ViaCepLookupError };

const VIACEP_URL = "https://viacep.com.br/ws";
const TIMEOUT_MS = 10_000;

export function digitsOnlyCep(cep: string): string {
  return cep.replace(/\D/g, "");
}

export function isValidCepDigits(cep: string): boolean {
  return digitsOnlyCep(cep).length === 8;
}

type ViaCepPayload = {
  erro?: boolean;
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

export async function lookupViaCep(cepInput: string): Promise<ViaCepLookupOutcome> {
  const digits = digitsOnlyCep(cepInput);
  if (digits.length !== 8) {
    return {
      ok: false,
      error: {
        code: "CEP_INVALID",
        message: "Informe um CEP com 8 dígitos.",
        hint: "Ex.: 29055-260"
      }
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${VIACEP_URL}/${digits}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "CEP_LOOKUP_UNAVAILABLE",
          message: `ViaCEP indisponível (HTTP ${res.status}).`,
          hint: "Preencha o endereço manualmente."
        }
      };
    }

    const data = (await res.json()) as ViaCepPayload;
    if (data.erro || !data.localidade) {
      return {
        ok: false,
        error: {
          code: "CEP_NOT_FOUND",
          message: "CEP não encontrado.",
          hint: "Verifique o número ou preencha rua, bairro e cidade manualmente."
        }
      };
    }

    const line = [data.logradouro, data.complemento].filter(Boolean).join(", ");

    return {
      ok: true,
      data: {
        postal_code: data.cep ?? digits,
        address_line: line || "",
        district: data.bairro ?? "",
        city: data.localidade ?? "",
        state: (data.uf ?? "").toUpperCase()
      }
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "CEP_LOOKUP_UNAVAILABLE" : "CEP_LOOKUP_NETWORK",
        message: aborted ? "Consulta CEP expirou (timeout)." : "Falha de rede ao consultar CEP.",
        hint: "Preencha o endereço manualmente."
      }
    };
  }
}
