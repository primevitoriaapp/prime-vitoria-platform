import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { googlePlacesKey } from "@/lib/integrations/google-places";
import { searchNominatimBrazil } from "@/lib/integrations/nominatim-search";
import { haversineKm } from "@/lib/trips/km-distance";

export const runtime = "nodejs";

const schema = z.object({
  points: z
    .array(z.object({ text: z.string().trim().max(300).default(""), lat: z.number().nullable().optional(), lng: z.number().nullable().optional() }))
    .min(2)
    .max(14)
});

type P = { lat: number; lng: number };

async function timed(url: string, init: RequestInit, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Endereço digitado (sem coordenadas) → coordenadas: Google Places (texto) e, se falhar, OpenStreetMap. */
async function geocode(text: string, key: string | null): Promise<P | null> {
  if (key) {
    try {
      const res = await timed("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location" },
        body: JSON.stringify({
          textQuery: text,
          languageCode: "pt-BR",
          regionCode: "br",
          locationBias: { circle: { center: { latitude: -20.2976, longitude: -40.2958 }, radius: 50000 } },
          pageSize: 1
        })
      });
      if (res.ok) {
        const j = (await res.json()) as { places?: { location?: { latitude?: number; longitude?: number } }[] };
        const loc = j.places?.[0]?.location;
        if (loc?.latitude != null && loc.longitude != null) return { lat: loc.latitude, lng: loc.longitude };
      }
    } catch {
      /* tenta OSM */
    }
  }
  const r = await searchNominatimBrazil(text, 1).catch(() => null);
  if (r && r.ok && r.data[0]) return { lat: r.data[0].lat, lng: r.data[0].lng };
  return null;
}

/** Km de carro pela rota: Google Routes; se não estiver liberado, OSRM (mapa aberto). */
async function drivingKm(pts: P[], key: string | null): Promise<{ km: number; source: string } | null> {
  if (key) {
    try {
      const wp = (p: P) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
      const res = await timed("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
        body: JSON.stringify({ origin: wp(pts[0]), destination: wp(pts[pts.length - 1]), intermediates: pts.slice(1, -1).map(wp), travelMode: "DRIVE", languageCode: "pt-BR", regionCode: "br" })
      });
      if (res.ok) {
        const j = (await res.json()) as { routes?: { distanceMeters?: number }[] };
        const m = Number(j.routes?.[0]?.distanceMeters ?? 0);
        if (m > 0) return { km: Math.round(m / 100) / 10, source: "google" };
      }
    } catch {
      /* tenta OSRM */
    }
  }
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const res = await timed(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`, { headers: { "User-Agent": "PrimeVitoria/1.0" } });
    if (res.ok) {
      const j = (await res.json()) as { routes?: { distance?: number }[] };
      const m = Number(j.routes?.[0]?.distance ?? 0);
      if (m > 0) return { km: Math.round(m / 100) / 10, source: "mapa" };
    }
  } catch {
    /* estimativa abaixo */
  }
  return null;
}

/** POST /api/maps/route-km — km de carro da rota do orçamento (localiza endereços digitados sem coordenada). */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const { points } = schema.parse(await request.json());
    const key = googlePlacesKey();
    const used = points.filter((p) => (p.lat != null && p.lng != null) || p.text.length >= 3);
    if (used.length < 2) return fail("FEW_POINTS", "Preencha a saída e o destino.", 400);

    const resolved: (P & { text: string; found: boolean })[] = [];
    for (const p of used) {
      if (p.lat != null && p.lng != null) {
        resolved.push({ lat: p.lat, lng: p.lng, text: p.text, found: false });
        continue;
      }
      const g = await geocode(p.text, key);
      if (!g) return fail("NOT_FOUND", `Não achei no mapa: "${p.text}". Escolha o endereço na lista de sugestões.`, 422);
      resolved.push({ ...g, text: p.text, found: true });
    }

    const route = await drivingKm(resolved, key);
    if (route) return ok({ ...route, points: resolved });
    let straight = 0;
    for (let i = 1; i < resolved.length; i++) straight += haversineKm(resolved[i - 1].lat, resolved[i - 1].lng, resolved[i].lat, resolved[i].lng);
    return ok({ km: Math.round(straight * 1.3 * 10) / 10, source: "linha_reta", points: resolved });
  } catch (error) {
    if (error instanceof z.ZodError) return fail("INVALID_BODY", "Dados inválidos", 400);
    return mapApiError(error);
  }
}
