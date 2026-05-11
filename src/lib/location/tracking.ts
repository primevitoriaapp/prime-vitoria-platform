export interface DriverLocationPayload {
  driver_id: string;
  trip_id?: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  recorded_at: string;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function validateDriverLocation(payload: DriverLocationPayload): void {
  if (!isValidCoordinate(payload.lat, payload.lng)) {
    throw new Error("Invalid coordinate");
  }

  if (payload.lat === 0 && payload.lng === 0) {
    throw new Error("Invalid coordinate origin");
  }
}
