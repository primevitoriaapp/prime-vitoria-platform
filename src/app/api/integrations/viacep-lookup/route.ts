import { lookupViaCep } from "@/lib/integrations/viacep-public-lookup";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability, can } from "@/lib/security/rbac";

/** GET /api/integrations/viacep-lookup?cep=29055260 */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (
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
    return ok(outcome.data);
  } catch (error) {
    return mapApiError(error);
  }
}
