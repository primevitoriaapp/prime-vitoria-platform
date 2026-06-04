import { z } from "zod";
import { isValidCpf, lookupCpfPublic } from "@/lib/integrations/cpf-public-lookup";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { db } from "@/lib/server/db";

const querySchema = z.object({
  cpf: z
    .string()
    .min(1, "Informe o CPF")
    .transform((value) => value.replace(/\D/g, ""))
    .refine((digits) => digits.length === 11, "CPF deve ter 11 dígitos")
    .refine((digits) => isValidCpf(digits), "CPF inválido (dígitos verificadores)")
});

export const runtime = "nodejs";

/** Consulta CPF (API configurável ou cadastro interno). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);

    const url = new URL(request.url);
    const { cpf } = querySchema.parse({ cpf: url.searchParams.get("cpf") ?? "" });

    let internalName: string | null = null;
    let internalStatus: string | null = null;

    const { data: clientHit } = await db
      .from("clients")
      .select("name, registry_status")
      .eq("tenant_id", tenantId)
      .eq("document", cpf)
      .maybeSingle();
    if (clientHit?.name) {
      internalName = clientHit.name;
      internalStatus = (clientHit.registry_status as string | null) ?? null;
    } else {
      const { data: driverHit } = await db
        .from("drivers")
        .select("cpf, profile_id")
        .eq("tenant_id", tenantId)
        .eq("cpf", cpf)
        .maybeSingle();
      if (driverHit?.profile_id) {
        const { data: profile } = await db.from("profiles").select("name").eq("id", driverHit.profile_id).maybeSingle();
        internalName = profile?.name ?? null;
      }
    }

    const outcome = await lookupCpfPublic(cpf, {
      full_name: internalName,
      registry_status: internalStatus ?? undefined
    });

    if (!outcome.ok) {
      const status =
        outcome.error.code === "CPF_NOT_FOUND"
          ? 404
          : outcome.error.code === "CPF_INVALID"
            ? 422
            : outcome.error.code === "CPF_LOOKUP_TIMEOUT"
              ? 504
              : 503;
      return fail(outcome.error.code, outcome.error.message, status, outcome.error.hint);
    }

    return ok(outcome.data);
  } catch (error) {
    return mapApiError(error);
  }
}
