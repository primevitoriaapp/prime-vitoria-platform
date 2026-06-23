import type { GpsPoint } from "@/lib/trips/km-distance";

export type DriverGpsTrailPoint = GpsPoint;

const STORAGE_KEY = "pv-driver-gps-trails";
const MAX_TRIPS_STORED = 5;

type StoredTrails = Record<
  string,
  {
    points: DriverGpsTrailPoint[];
    updatedAt: string;
  }
>;

function readAll(): StoredTrails {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredTrails;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: StoredTrails): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(data);
    if (keys.length > MAX_TRIPS_STORED) {
      const sorted = keys.sort(
        (a, b) => (data[b]?.updatedAt ?? "").localeCompare(data[a]?.updatedAt ?? "")
      );
      for (const key of sorted.slice(MAX_TRIPS_STORED)) {
        delete data[key];
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function loadGpsTrail(tripId: string): DriverGpsTrailPoint[] {
  return readAll()[tripId]?.points ?? [];
}

export function saveGpsTrail(tripId: string, points: DriverGpsTrailPoint[]): void {
  const all = readAll();
  all[tripId] = { points, updatedAt: new Date().toISOString() };
  writeAll(all);
}

/** Adiciona ponto ao trail da corrida (ordena por horário). */
export function appendGpsTrailPoint(tripId: string, point: DriverGpsTrailPoint): DriverGpsTrailPoint[] {
  const existing = loadGpsTrail(tripId);
  const next = [...existing, point].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  saveGpsTrail(tripId, next);
  return next;
}

export function clearGpsTrail(tripId: string): void {
  const all = readAll();
  if (!all[tripId]) return;
  delete all[tripId];
  writeAll(all);
}
