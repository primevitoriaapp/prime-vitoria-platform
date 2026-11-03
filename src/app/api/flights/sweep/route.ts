import { mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { sweepDueFlights } from "@/lib/integrations/flight-watch";

/** Chamado pelo painel aberto a cada poucos minutos: confere os voos das próximas horas. */
export async function POST() {
  try {
    const s = await getSessionContext();
    if (s.role !== "admin" && s.role !== "operador") return ok({ checked: 0, skipped: "papel" });
    return ok(await sweepDueFlights());
  } catch (e) {
    return mapApiError(e);
  }
}
