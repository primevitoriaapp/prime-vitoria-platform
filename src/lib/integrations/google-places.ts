/**
 * Busca de endereços pelo Google Places API (New), com sessão:
 * as sugestões enquanto digita saem de graça quando a sessão termina
 * com um "detalhe do local" (Place Details) usando o mesmo token.
 * @see https://developers.google.com/maps/documentation/places/web-service/place-session-tokens
 */

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const TIMEOUT_MS = 8_000;

/** Centro da Grande Vitória — prioriza resultados próximos, sem excluir o resto do Brasil. */
const VITORIA_BIAS = { latitude: -20.2976, longitude: -40.2958 };

export function googlePlacesKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

export type GoogleSuggestion = {
  place_id: string;
  main_text: string;
  secondary_text: string;
};

export type GooglePlace = {
  place_id: string;
  display_name: string;
  lat: number;
  lng: number;
};

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
};

export function mapAutocompleteResponse(json: AutocompleteResponse): GoogleSuggestion[] {
  const out: GoogleSuggestion[] = [];
  for (const s of json.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p?.placeId) continue;
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
    if (!main) continue;
    out.push({
      place_id: p.placeId,
      main_text: main,
      secondary_text: (p.structuredFormat?.secondaryText?.text ?? "").replace(/,?\s*Brasil$/i, "")
    });
  }
  return out;
}

type DetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

/** "Hotel Golden Tulip, Av. Nossa Sra. dos Navegantes, 635 - Enseada do Suá, Vitória - ES" */
export function mapDetailsResponse(json: DetailsResponse): GooglePlace | null {
  const lat = json.location?.latitude;
  const lng = json.location?.longitude;
  if (!json.id || typeof lat !== "number" || typeof lng !== "number") return null;
  const name = json.displayName?.text?.trim() ?? "";
  const address = (json.formattedAddress ?? "").replace(/,\s*\d{5}-\d{3}/, "").replace(/,?\s*Brasil$/i, "").trim();
  const display = name && !address.toLowerCase().startsWith(name.toLowerCase()) ? `${name}, ${address}` : address || name;
  return { place_id: json.id, display_name: display, lat, lng };
}

async function timedFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

export async function googleAutocomplete(input: string, sessionToken: string, key: string): Promise<GoogleSuggestion[]> {
  const res = await timedFetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: "pt-BR",
      regionCode: "br",
      includedRegionCodes: ["br"],
      locationBias: { circle: { center: VITORIA_BIAS, radius: 50_000 } }
    })
  });
  if (!res.ok) throw new Error(`Google Places autocomplete HTTP ${res.status}`);
  return mapAutocompleteResponse((await res.json()) as AutocompleteResponse);
}

export async function googlePlaceDetails(placeId: string, sessionToken: string, key: string): Promise<GooglePlace | null> {
  const url = new URL(DETAILS_URL + encodeURIComponent(placeId));
  url.searchParams.set("languageCode", "pt-BR");
  url.searchParams.set("regionCode", "br");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await timedFetch(url.toString(), {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" }
  });
  if (!res.ok) throw new Error(`Google Place Details HTTP ${res.status}`);
  return mapDetailsResponse((await res.json()) as DetailsResponse);
}
