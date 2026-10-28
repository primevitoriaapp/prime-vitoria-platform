/** "la 3345" → "LA3345"; aceita 2 letras/dígito da companhia + 1 a 4 números (e sufixo de letra). */
export function normalizeFlightNumber(raw: string | null | undefined): string | null {
  const t = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!t) return null;
  const m = /^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4}[A-Z]?)$/.exec(t);
  if (!m || !/[A-Z]/.test(m[1])) return null;
  return `${m[1]}${m[2]}`;
}

/** Página pública do voo no Flightradar24 (horário previsto, atraso, posição). */
export function flightTrackerUrl(flight: string): string {
  return `https://www.flightradar24.com/data/flights/${encodeURIComponent(flight.toLowerCase())}`;
}
