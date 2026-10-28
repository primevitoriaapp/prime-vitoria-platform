import { z } from "zod";
import { googlePlaceDetails, googlePlacesKey } from "@/lib/integrations/google-places";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  place_id: z.string().min(3).max(300),
  session: z.string().max(64).optional()
});

/** GET /api/integrations/address-details?place_id=...&session=... — coordenadas do local escolhido (Google). */
export async function GET(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`address-details:${ip}`, 30, 60_000);

    const session = await getSessionContext();
    if (session.role === "guest") return fail("FORBIDDEN", "Sessão inválida", 403);

    const key = googlePlacesKey();
    if (!key) return fail("GOOGLE_NOT_CONFIGURED", "Busca do Google não configurada", 503);

    const url = new URL(request.url);
    const q = querySchema.parse({
      place_id: url.searchParams.get("place_id") ?? "",
      session: url.searchParams.get("session") ?? undefined
    });
    const place = await googlePlaceDetails(q.place_id, q.session ?? "", key);
    if (!place) return fail("PLACE_NOT_FOUND", "Local não encontrado", 404);
    return ok(place);
  } catch (error) {
    return mapApiError(error);
  }
}
