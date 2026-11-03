import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { checkTripFlight, flightApiConfigured } from "@/lib/integrations/flight-watch";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/** Botão "Atualizar voo" na corrida. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await getSessionContext();
    if (s.role !== "admin" && s.role !== "operador") return fail("FORBIDDEN", "Sem permissão.", 403);
    if (!flightApiConfigured()) return fail("NOT_CONFIGURED", "Acompanhamento de voo ainda não ligado (falta a chave do AeroDataBox).", 422);
    const { id } = await params;
    enforceRateLimit(`flight-check:${id}`, 3, 10 * 60_000);
    const r = await checkTripFlight(id, { manual: true });
    if (!r.ok) return fail("FLIGHT_CHECK_FAILED", r.reason, 502);
    return ok(r);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.includes("Rate limit")) return fail("RATE_LIMIT", "Espere alguns minutos para consultar de novo.", 429);
    return mapApiError(e);
  }
}
