import { z } from "zod";
import { searchNominatimBrazil } from "@/lib/integrations/nominatim-search";
import { googleAutocomplete, googlePlacesKey } from "@/lib/integrations/google-places";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(3, "Mínimo 3 caracteres").max(200),
  session: z.string().max(64).optional()
});

/** GET /api/integrations/address-search?q=... — Nominatim (Brasil). */
export async function GET(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`address-search:${ip}`, 30, 60_000);

    const session = await getSessionContext();
    if (session.role === "guest") {
      return fail("FORBIDDEN", "Sessão inválida", 403);
    }
    const canSearch =
      session.role === "admin" ||
      session.role === "operador" ||
      session.role === "motorista" ||
      session.role === "cliente" ||
      session.role === "financeiro";
    if (!canSearch) {
      return fail("FORBIDDEN", "Sem permissão para buscar endereços", 403);
    }

    const url = new URL(request.url);
    const { q, session: sessionToken } = querySchema.parse({
      q: url.searchParams.get("q") ?? "",
      session: url.searchParams.get("session") ?? undefined
    });

    // Google (acha empresas, hotéis, condomínios). Sem chave ou com falha, cai no OpenStreetMap.
    const googleKey = googlePlacesKey();
    if (googleKey) {
      try {
        const hits = await googleAutocomplete(q, sessionToken ?? crypto.randomUUID(), googleKey);
        if (hits.length > 0) {
          return ok(
            hits.map((h) => ({
              provider: "google" as const,
              place_id: h.place_id,
              display_name: h.secondary_text ? `${h.main_text}, ${h.secondary_text}` : h.main_text,
              main_text: h.main_text,
              secondary_text: h.secondary_text,
              lat: null,
              lng: null
            }))
          );
        }
      } catch (err) {
        console.warn("[address-search] Google falhou, usando OpenStreetMap", {
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const outcome = await searchNominatimBrazil(q);
    if (!outcome.ok) {
      const status =
        outcome.error.code === "QUERY_TOO_SHORT"
          ? 422
          : outcome.error.code === "NOMINATIM_NOT_FOUND"
            ? 404
            : outcome.error.code === "NOMINATIM_TIMEOUT"
              ? 504
              : 503;
      return fail(outcome.error.code, outcome.error.message, status, outcome.error.hint);
    }

    return ok(outcome.data);
  } catch (error) {
    return mapApiError(error);
  }
}
