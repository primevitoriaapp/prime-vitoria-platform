/**
 * Ordem das paradas de desembarque: trocar a ordem e sugerir a mais curta.
 * Distância em linha reta × 1,3 (aproximação de rua), sem custo de API.
 */
type Pt = { lat?: number | null; lng?: number | null };
type Stop = Pt & { dropped_at?: string | null; final?: boolean | null };

export function km(a: Pt, b: Pt): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
}

export function routeKm(start: Pt, stops: Pt[]): number | null {
  let total = 0;
  let cur = start;
  for (const s of stops) {
    const d = km(cur, s);
    if (d == null) return null;
    total += d;
    cur = s;
  }
  return total;
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[...Array(n).keys()]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

/**
 * Aplica uma nova ordem: paradas já feitas ficam na frente, como estavam; a última vira
 * o destino final. `order` lista os índices atuais das paradas ainda pendentes.
 */
export function reorderStops<T extends Stop>(stops: T[], order: number[]): T[] | null {
  const done = stops.map((s, i) => ({ s, i })).filter((x) => x.s.dropped_at);
  const pending = stops.map((s, i) => ({ s, i })).filter((x) => !x.s.dropped_at).map((x) => x.i);
  if (order.length !== pending.length || [...order].sort((a, b) => a - b).join() !== [...pending].sort((a, b) => a - b).join()) return null;
  const next = [...done.map((x) => x.s), ...order.map((i) => stops[i])].map((s) => ({ ...s, final: false }) as T);
  if (stops.some((s) => s.final)) next[next.length - 1] = { ...next[next.length - 1], final: true };
  return next;
}

/** Melhor ordem das paradas pendentes (até 7 → testa todas). Null se faltar coordenada. */
export function suggestOrder(start: Pt, stops: Stop[]): { order: number[]; km: number; currentKm: number } | null {
  const pending = stops.map((s, i) => ({ s, i })).filter((x) => !x.s.dropped_at);
  if (pending.length < 2 || pending.length > 7) return null;
  const currentKm = routeKm(start, pending.map((x) => x.s));
  if (currentKm == null) return null;
  let best = { order: pending.map((x) => x.i), km: currentKm };
  for (const p of permutations(pending.length)) {
    const d = routeKm(start, p.map((k) => pending[k].s));
    if (d != null && d < best.km - 0.05) best = { order: p.map((k) => pending[k].i), km: d };
  }
  return { ...best, currentKm };
}
