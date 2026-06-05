const MAX_LABEL = 40;

/** Extrai o nome principal de textos longos (ex. Nominatim / OpenStreetMap). */
export function shortPlaceLabel(text: string | null | undefined): string {
  const raw = text?.trim();
  if (!raw) return "—";

  const beforeDash = raw.split(/\s*[-–—]\s+/)[0]?.trim();
  const commaParts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  let primary = commaParts[0] ?? raw;

  if (beforeDash && beforeDash.length > 0 && beforeDash.length <= primary.length + 8) {
    primary = beforeDash;
  }

  return primary || "—";
}

export function truncatePlaceLabel(text: string, max = MAX_LABEL): string {
  const s = text.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Rota resumida para cards (origem → destino, até 40 caracteres por lado). */
export function formatRouteShort(
  origin: string | null | undefined,
  destination: string | null | undefined,
  maxEach = MAX_LABEL
): string {
  const o = truncatePlaceLabel(shortPlaceLabel(origin), maxEach);
  const d = truncatePlaceLabel(shortPlaceLabel(destination), maxEach);
  return `${o} → ${d}`;
}
