export type DriverTripGpsState = {
  accumulatedKm: number | null;
  pointCount: number;
  tracking: boolean;
  requiresManualKm: boolean;
  gpsError: string | null;
};

export function parseDriverKmInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const km = Number(normalized);
  return Number.isFinite(km) && km > 0 ? km : null;
}

/** Mostra campo manual ao finalizar quando GPS falhou ou ainda não há distância calculável. */
export function driverShowsManualKmOnComplete(gps: DriverTripGpsState, completing: boolean): boolean {
  if (!completing) return false;
  if (gps.requiresManualKm) return true;
  return gps.accumulatedKm == null || gps.accumulatedKm <= 0;
}

export function driverCanCompleteTrip(completing: boolean, gps: DriverTripGpsState, manualKmRaw: string): boolean {
  if (!completing) return true;
  if (!gps.requiresManualKm && gps.accumulatedKm != null && gps.accumulatedKm > 0) return true;
  return parseDriverKmInput(manualKmRaw) != null;
}

export function formatDriverGpsKm(km: number | null): string {
  if (km == null) return "—";
  return km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
