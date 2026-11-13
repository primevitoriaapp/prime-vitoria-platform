import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export const runtime = "nodejs";

/** Nome e frase da empresa (Minha empresa) para o menu e telas de entrada. Sem dados sensíveis. */
export async function GET() {
  const p = await getTenantCompanyProfile(DEFAULT_TENANT_ID);
  return Response.json(
    { trade_name: p.trade_name, tagline: p.tagline },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}
