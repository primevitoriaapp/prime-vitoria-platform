import { db } from "@/lib/server/db";

/** `tenant_id` do cliente (fonte de verdade para `client_pricing_rules`). */
export async function getClientTenantId(
  clientId: string,
  fallbackTenantId: string
): Promise<string> {
  const { data, error } = await db.from("clients").select("tenant_id").eq("id", clientId).maybeSingle();
  if (error || !data?.tenant_id) return fallbackTenantId;
  return data.tenant_id as string;
}
