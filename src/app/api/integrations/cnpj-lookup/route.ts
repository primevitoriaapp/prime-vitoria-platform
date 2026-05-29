import { z } from "zod";
import { lookupCnpjPublic } from "@/lib/integrations/cnpj-public-lookup";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

const querySchema = z.object({
  cnpj: z.string().min(14).max(18)
});

/** Consulta CNPJ (Brasil API). Não bloqueia cadastro se falhar — UI usa fallback manual. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");

    const url = new URL(request.url);
    const { cnpj } = querySchema.parse({ cnpj: url.searchParams.get("cnpj") ?? "" });

    const result = await lookupCnpjPublic(cnpj);
    if (!result) {
      return fail("CNPJ_LOOKUP_FAILED", "Não foi possível consultar o CNPJ. Preencha manualmente.", 404);
    }

    return ok(result);
  } catch (error) {
    return mapApiError(error);
  }
}
