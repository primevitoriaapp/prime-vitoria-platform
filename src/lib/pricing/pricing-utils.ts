export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function roundKm(n: number): number {
  return Math.round(n * 100) / 100;
}

export function billableKmWithMinimum(kmReal: number | null, minimumKm: number | null): number | null {
  if (kmReal == null) return minimumKm != null ? roundKm(minimumKm) : null;
  const min = minimumKm != null && minimumKm > 0 ? minimumKm : 0;
  return roundKm(Math.max(kmReal, min));
}

export function resolveKmReal(input: {
  km_real: number | null;
  km_planned: number | null;
}): number | null {
  const real = input.km_real != null ? Number(input.km_real) : null;
  const planned = input.km_planned != null ? Number(input.km_planned) : null;
  if (real != null && real >= 0) return real;
  if (planned != null && planned >= 0) return planned;
  return null;
}
