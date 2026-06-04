import { z } from "zod";
import { searchNominatimBrazil } from "@/lib/integrations/nominatim-search";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(3, "Mínimo 3 caracteres")
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
    const { q } = querySchema.parse({ q: url.searchParams.get("q") ?? "" });

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
