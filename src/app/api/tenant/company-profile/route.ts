import { z } from "zod";
import {
  getTenantCompanyProfile,
  upsertTenantCompanyProfile
} from "@/lib/company/tenant-company-profile";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const patchSchema = z.object({
  trade_name: z.string().min(1).optional(),
  legal_name: z.string().min(1).optional(),
  cnpj: z.string().optional(),
  address_line: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  tagline: z.string().max(60).optional(),
  whatsapp: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
  instagram: z.string().max(80).optional(),
  email_sender_name: z.string().trim().min(2).max(60).optional(),
  email_reply_to: z.string().trim().email("E-mail de resposta inválido").optional(),
  email_finance: z.string().trim().email("E-mail do financeiro inválido").optional()
});

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    const profile = await getTenantCompanyProfile(tenantId);
    return ok(profile);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador altera os dados da empresa", 403);
    const tenantId = assertTenantScope(session);
    const body = patchSchema.parse(await request.json());
    const profile = await upsertTenantCompanyProfile(tenantId, {
      ...body,
      email: body.email === "" ? "" : body.email
    });
    return ok(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail("INVALID_BODY", error.issues[0]?.message ?? "Dados inválidos", 400);
    }
    return mapApiError(error);
  }
}
