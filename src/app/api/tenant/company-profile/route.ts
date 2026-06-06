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
  email: z.string().email().optional().or(z.literal(""))
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
    const tenantId = assertTenantScope(session);
    const body = patchSchema.parse(await request.json());
    const profile = await upsertTenantCompanyProfile(tenantId, {
      ...body,
      email: body.email === "" ? "" : body.email
    });
    return ok(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail("INVALID_BODY", error.message, 400);
    }
    return mapApiError(error);
  }
}
