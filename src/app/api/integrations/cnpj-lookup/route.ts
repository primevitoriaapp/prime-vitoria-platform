import { z } from "zod";
import { isValidCnpj, lookupCnpjPublic } from "@/lib/integrations/cnpj-public-lookup";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

const querySchema = z.object({
  cnpj: z
    .string()
    .min(1, "Informe o CNPJ")
    .transform((value) => value.replace(/\D/g, ""))
    .refine((digits) => digits.length === 14, "CNPJ deve ter 14 dígitos")
    .refine((digits) => isValidCnpj(digits), "CNPJ inválido (dígitos verificadores)")
});

export const runtime = "nodejs";

/** Consulta CNPJ (Brasil API). Não bloqueia cadastro se falhar — UI usa fallback manual. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");

    const url = new URL(request.url);
    const { cnpj } = querySchema.parse({ cnpj: url.searchParams.get("cnpj") ?? "" });

    const outcome = await lookupCnpjPublic(cnpj);
    if (!outcome.ok) {
      const status =
        outcome.error.code === "CNPJ_NOT_FOUND"
          ? 404
          : outcome.error.code === "CNPJ_INVALID"
            ? 422
            : outcome.error.code === "CNPJ_LOOKUP_RATE_LIMIT"
              ? 429
              : outcome.error.code === "CNPJ_LOOKUP_TIMEOUT"
                ? 504
                : 503;
      return fail(outcome.error.code, outcome.error.message, status, outcome.error.hint);
    }

    return ok(outcome.data);
  } catch (error) {
    return mapApiError(error);
  }
}
