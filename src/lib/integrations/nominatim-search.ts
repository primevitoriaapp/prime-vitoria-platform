/**
 * Busca de endereços via OpenStreetMap Nominatim (Brasil).
 * @see https://nominatim.org/release-docs/develop/api/Search/
 */

export const NOMINATIM_USER_AGENT = "PrimeVitoria/1.0 (contato@primevitoria.com)";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 12_000;
const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 5;

export type NominatimAddressHit = {
  place_id: number;
  /** Texto completo para gravar em origin_text / destination_text. */
  display_name: string;
  lat: number;
  lng: number;
  name?: string;
  type?: string;
  city?: string;
  state?: string;
};

export type NominatimSearchError = {
  code: "QUERY_TOO_SHORT" | "NOMINATIM_NOT_FOUND" | "NOMINATIM_TIMEOUT" | "NOMINATIM_UNAVAILABLE" | "NOMINATIM_NETWORK";
  message: string;
  hint?: string;
};

export type NominatimSearchOutcome =
  | { ok: true; data: NominatimAddressHit[] }
  | { ok: false; error: NominatimSearchError };

type RawHit = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  type?: string;
  addresstype?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
  };
};

function cityFromAddress(addr: RawHit["address"]): string | undefined {
  if (!addr) return undefined;
  return addr.city ?? addr.town ?? addr.village ?? addr.municipality;
}

function mapHit(raw: RawHit): NominatimAddressHit | null {
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!raw.display_name?.trim() || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return {
    place_id: raw.place_id ?? 0,
    display_name: raw.display_name.trim(),
    lat,
    lng,
    name: raw.name?.trim(),
    type: raw.type ?? raw.addresstype,
    city: cityFromAddress(raw.address),
    state: raw.address?.state
  };
}

export async function searchNominatimBrazil(
  query: string,
  limit = DEFAULT_LIMIT
): Promise<NominatimSearchOutcome> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) {
    return {
      ok: false,
      error: {
        code: "QUERY_TOO_SHORT",
        message: "Digite pelo menos 3 caracteres para buscar endereços."
      }
    };
  }

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 10)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT
      },
      cache: "no-store"
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "NOMINATIM_UNAVAILABLE",
          message: `Serviço de endereços indisponível (HTTP ${res.status}).`,
          hint: "Continue com texto livre no campo."
        }
      };
    }

    const raw = (await res.json()) as RawHit[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return {
        ok: false,
        error: {
          code: "NOMINATIM_NOT_FOUND",
          message: "Nenhum endereço encontrado para esta busca.",
          hint: "Refine o texto ou preencha o endereço manualmente."
        }
      };
    }

    const data = raw.map(mapHit).filter((h): h is NominatimAddressHit => h !== null);
    if (data.length === 0) {
      return {
        ok: false,
        error: {
          code: "NOMINATIM_NOT_FOUND",
          message: "Nenhum endereço válido devolvido.",
          hint: "Preencha o endereço manualmente."
        }
      };
    }

    return { ok: true, data: data.slice(0, limit) };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "NOMINATIM_TIMEOUT" : "NOMINATIM_NETWORK",
        message: aborted ? "Busca de endereço expirou." : "Falha de rede ao consultar endereços.",
        hint: "Preencha o endereço manualmente."
      }
    };
  }
}
