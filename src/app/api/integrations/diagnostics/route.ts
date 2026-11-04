import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/server/session";

export const dynamic = "force-dynamic";

async function probe(url: string, init: RequestInit): Promise<{ status: number | string; body: string }> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 600) };
  } catch (e) {
    return { status: "falhou", body: e instanceof Error ? e.message : String(e) };
  }
}

/** Diagnóstico (só administrador): o Google Places e o serviço de voos estão respondendo? Não mostra chaves. */
export async function GET() {
  const s = await getSessionContext();
  if (s.role !== "admin") return NextResponse.json({ erro: "Só o administrador." }, { status: 403 });

  const gKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const google = gKey
    ? await probe("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gKey },
        body: JSON.stringify({ input: "Golden Tulip Vitória", languageCode: "pt-BR", regionCode: "br", includedRegionCodes: ["br"] })
      })
    : { status: "sem chave", body: "" };

  const market = process.env.AERODATABOX_APIMARKET_KEY?.trim();
  const rapid = process.env.AERODATABOX_RAPIDAPI_KEY?.trim();
  const path = "/flights/number/LA3844/2026-11-05?withAircraftImage=false&withLocation=false&dateLocalRole=Both";
  const voos: Record<string, unknown> = {};
  if (market) {
    for (const h of ["x-api-market-key", "x-magicapi-key", "x-api-key"]) {
      voos[`apimarket ${h}`] = await probe(`https://prod.api.market/api/v1/aedbx/aerodatabox${path}`, { headers: { [h]: market } });
    }
  }
  if (rapid) {
    voos.rapidapi = await probe(`https://aerodatabox.p.rapidapi.com${path}`, {
      headers: { "X-RapidAPI-Key": rapid, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" }
    });
  }
  if (!market && !rapid) voos.chave = "nenhuma chave de voo configurada";

  return NextResponse.json({ google_places: google, voos }, { headers: { "cache-control": "no-store" } });
}
