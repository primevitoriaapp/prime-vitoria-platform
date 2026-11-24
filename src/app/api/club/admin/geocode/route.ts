import { searchNominatimBrazil } from "@/lib/integrations/nominatim-search";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";

export const runtime = "nodejs";

/** GET /api/club/admin/geocode?q=endereço — latitude/longitude de uma unidade do Prime Club. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const r = await searchNominatimBrazil(q, 1);
    if (!r.ok || !r.data.length) return fail("NOT_FOUND", "Endereço não encontrado", 404);
    const hit = r.data[0];
    return ok({ lat: hit.lat, lng: hit.lng, label: hit.display_name });
  } catch (error) {
    return mapApiError(error);
  }
}
