"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Trip } from "@/lib/domain/types";
import { actualKmFromTrail } from "@/lib/trips/km-distance";
import {
  appendGpsTrailPoint,
  clearGpsTrail,
  loadGpsTrail,
  type DriverGpsTrailPoint
} from "@/lib/trips/driver-gps-trail-storage";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { DriverTripGpsState } from "@/lib/trips/driver-complete-km";

const SAMPLE_INTERVAL_MS = 30_000;

export type { DriverTripGpsState } from "@/lib/trips/driver-complete-km";

const IDLE_GPS_STATE: DriverTripGpsState = {
  accumulatedKm: null,
  pointCount: 0,
  tracking: false,
  requiresManualKm: false,
  gpsError: null
};

type Options = {
  trips: Trip[];
  devFallbackRole?: "motorista" | "admin";
};

async function postDriverLocation(
  tripId: string,
  point: DriverGpsTrailPoint,
  devFallbackRole: "motorista" | "admin"
): Promise<void> {
  await fetchWithSupabaseSession(
    "/api/drivers/location",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        lat: point.lat,
        lng: point.lng,
        recorded_at: point.recorded_at
      })
    },
    devFallbackRole
  ).catch(() => {
    /* trail local persiste; servidor sincroniza no próximo ponto */
  });
}

function gpsStateFromPoints(
  points: DriverGpsTrailPoint[],
  tracking: boolean,
  requiresManualKm: boolean,
  gpsError: string | null
): DriverTripGpsState {
  return {
    accumulatedKm: actualKmFromTrail(points),
    pointCount: points.length,
    tracking,
    requiresManualKm,
    gpsError
  };
}

/** Rastreia GPS durante corrida em `in_progress` (amostra a cada 30s, persiste em localStorage). */
export function useDriverTripGpsTracking({ trips, devFallbackRole = "motorista" }: Options) {
  const inProgressTrip = trips.find((t) => t.operational_status === "in_progress") ?? null;
  const tripId = inProgressTrip?.id ?? null;

  const [stateByTrip, setStateByTrip] = useState<Record<string, DriverTripGpsState>>({});
  const watchIdRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef(0);
  const pointsRef = useRef<DriverGpsTrailPoint[]>([]);
  const tripIdRef = useRef<string | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    lastSampleAtRef.current = 0;
  }, []);

  const recordPoint = useCallback(
    (activeTripId: string, lat: number, lng: number) => {
      const point: DriverGpsTrailPoint = {
        lat,
        lng,
        recorded_at: new Date().toISOString()
      };
      const next = appendGpsTrailPoint(activeTripId, point);
      pointsRef.current = next;
      lastSampleAtRef.current = Date.now();
      setStateByTrip((prev) => ({
        ...prev,
        [activeTripId]: gpsStateFromPoints(next, true, false, null)
      }));
      void postDriverLocation(activeTripId, point, devFallbackRole);
    },
    [devFallbackRole]
  );

  useEffect(() => {
    stopWatch();
    tripIdRef.current = tripId;

    if (!tripId) return;

    const stored = loadGpsTrail(tripId);
    pointsRef.current = stored;
    lastSampleAtRef.current = stored.length > 0 ? Date.now() : 0;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStateByTrip((prev) => ({
        ...prev,
        [tripId]: gpsStateFromPoints(stored, false, true, "GPS indisponível neste dispositivo.")
      }));
      return;
    }

    setStateByTrip((prev) => ({
      ...prev,
      [tripId]: gpsStateFromPoints(stored, true, false, null)
    }));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (tripIdRef.current !== tripId) return;
        const now = Date.now();
        const hasPoints = pointsRef.current.length > 0;
        if (hasPoints && now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
        recordPoint(tripId, pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (tripIdRef.current !== tripId) return;
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada."
            : "Não foi possível obter localização GPS.";
        setStateByTrip((prev) => ({
          ...prev,
          [tripId]: gpsStateFromPoints(pointsRef.current, false, true, message)
        }));
        stopWatch();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );

    watchIdRef.current = watchId;

    return () => {
      stopWatch();
    };
  }, [tripId, recordPoint, stopWatch]);

  const getTripGpsState = useCallback(
    (id: string): DriverTripGpsState => stateByTrip[id] ?? IDLE_GPS_STATE,
    [stateByTrip]
  );

  const resolveActualKmForComplete = useCallback(
    (id: string, manualKm: number | null): number | null => {
      const gps = getTripGpsState(id);
      if (!gps.requiresManualKm && gps.accumulatedKm != null && gps.accumulatedKm > 0) {
        return gps.accumulatedKm;
      }
      return manualKm;
    },
    [getTripGpsState]
  );

  const clearTripTrail = useCallback(
    (id: string) => {
      clearGpsTrail(id);
      pointsRef.current = [];
      setStateByTrip((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (tripIdRef.current === id) stopWatch();
    },
    [stopWatch]
  );

  return {
    trackingTripId: tripId,
    getTripGpsState,
    resolveActualKmForComplete,
    clearTripTrail
  };
}
