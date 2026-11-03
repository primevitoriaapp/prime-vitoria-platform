import { db } from "@/lib/server/db";
import { BILLING_ISSUER_OPTIONS } from "@/lib/clients/billing-terms-calc";

/** Lê `?empresa=` da URL (ou cookie prime_empresa). "todas" quando ausente ou inválido. */
export function companyFromRequest(request: Request): string {
  const url = new URL(request.url);
  let v = url.searchParams.get("empresa");
  if (!v) {
    const m = (request.headers.get("cookie") ?? "").match(/(?:^|; )prime_empresa=([^;]+)/);
    v = m ? decodeURIComponent(m[1]) : "todas";
  }
  return BILLING_ISSUER_OPTIONS.some((o) => o.id === v) ? (v as string) : "todas";
}

/** Clientes faturados pela empresa escolhida (null = todas as empresas, sem filtro). */
export async function clientIdsOfCompany(tenantId: string, empresa: string): Promise<Set<string> | null> {
  if (empresa === "todas") return null;
  const { data } = await db.from("clients").select("id").eq("tenant_id", tenantId).eq("billing_issuer", empresa).limit(5000);
  return new Set((data ?? []).map((c) => c.id as string));
}
