/** Corrida que pede placa de receptivo: extra "placa com nome"/"receptivo" ou embarque em aeroporto/rodoviária. */
export function needsReceptiveSign(trip: { service_extras?: string[] | null; origin_text?: string | null }): boolean {
  const ex = trip.service_extras ?? [];
  if (ex.includes("placa_nome") || ex.includes("receptivo")) return true;
  return /aeroporto|airport|\bVIX\b|rodovi[aá]ria/i.test(String(trip.origin_text ?? ""));
}
