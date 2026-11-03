"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() || "";
export const VITORIA: { lat: number; lng: number } = { lat: -20.3155, lng: -40.3128 };

/** Estilo claro e limpo (sem comércios nem ícones), parecido com apps de mobilidade. */
export const CLEAN_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f3f2ef" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3f2ef" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e6e1d6" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#a3a3a3" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfdbe3" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9aa7b0" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#ecebe6" }] }
];

let googleLoader: Promise<any> | null = null;
export function loadGoogle(): Promise<any> {
  const w = window as unknown as { google?: any };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (googleLoader) return googleLoader;
  googleLoader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly&language=pt-BR&region=BR`;
    s.async = true;
    s.onload = () => ((window as any).google?.maps ? resolve((window as any).google) : reject(new Error("google")));
    s.onerror = () => {
      googleLoader = null;
      reject(new Error("google"));
    };
    document.head.appendChild(s);
  });
  return googleLoader;
}

