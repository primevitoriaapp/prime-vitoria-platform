import { lookupViaCep } from "@/lib/integrations/viacep-public-lookup";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability, can } from "@/lib/security/rbac";

/** GET /api/integrations/viacep-lookup?cep=29055260 */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (
      session.role !== "motorista" &&
      !can(session, "client.read") &&
      !can(session, "driver.read") &&
      !can(session, "trip.request")
    ) {
      assertCapability(session, "driver.read");
    }

    const cep = new URL(request.url).searchParams.get("cep")?.trim() ?? "";
    const outcome = await lookupViaCep(cep);
    if (!outcome.ok) {
      return fail(outcome.error.code, outcome.error.message, 404, outcome.error.hint);
    }
    const d = outcome.data;
    // Também nos nomes do ViaCEP (logradouro, bairro, localidade, uf), que várias telas usam.
    return ok({ ...d, logradouro: d.address_line, bairro: d.district, localidade: d.city, uf: d.state });
  } catch (error) {
    return mapApiError(error);
  }
}
