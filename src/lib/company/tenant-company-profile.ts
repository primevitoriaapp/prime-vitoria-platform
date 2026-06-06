import { db } from "@/lib/server/db";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export type TenantCompanyProfile = {
  tenant_id: string;
  trade_name: string;
  legal_name: string;
  cnpj: string;
  address_line: string;
  phone: string;
  email: string;
  logo_storage_path: string | null;
};

export const DEFAULT_COMPANY_PROFILE: Omit<TenantCompanyProfile, "tenant_id" | "logo_storage_path"> = {
  trade_name: "Prime Vitória",
  legal_name: "R J Prime Transporte LTDA",
  cnpj: "49.126.277/0001-54",
  address_line: "Rua Amélia da Cunha Ornellas 89, Bento Ferreira, Vitória ES",
  phone: "",
  email: "contato@primevitoria.com"
};

export async function getTenantCompanyProfile(tenantId: string): Promise<TenantCompanyProfile> {
  let data: Record<string, unknown> | null = null;
  try {
    const res = await db.from("tenant_company_profiles").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (res.error) throw res.error;
    data = res.data as Record<string, unknown> | null;
  } catch {
    return {
      tenant_id: tenantId,
      logo_storage_path: null,
      ...DEFAULT_COMPANY_PROFILE
    };
  }

  if (!data) {
    return {
      tenant_id: tenantId,
      logo_storage_path: null,
      ...DEFAULT_COMPANY_PROFILE
    };
  }

  return {
    tenant_id: tenantId,
    trade_name: (data.trade_name as string) || DEFAULT_COMPANY_PROFILE.trade_name,
    legal_name: (data.legal_name as string) || DEFAULT_COMPANY_PROFILE.legal_name,
    cnpj: (data.cnpj as string) || DEFAULT_COMPANY_PROFILE.cnpj,
    address_line: (data.address_line as string) || DEFAULT_COMPANY_PROFILE.address_line,
    phone: (data.phone as string) || "",
    email: (data.email as string) || DEFAULT_COMPANY_PROFILE.email,
    logo_storage_path: (data.logo_storage_path as string | null) ?? null
  };
}

export async function upsertTenantCompanyProfile(
  tenantId: string,
  patch: Partial<Omit<TenantCompanyProfile, "tenant_id">>
): Promise<TenantCompanyProfile> {
  const current = await getTenantCompanyProfile(tenantId);
  const row = {
    tenant_id: tenantId,
    trade_name: patch.trade_name ?? current.trade_name,
    legal_name: patch.legal_name ?? current.legal_name,
    cnpj: patch.cnpj ?? current.cnpj,
    address_line: patch.address_line ?? current.address_line,
    phone: patch.phone ?? current.phone,
    email: patch.email ?? current.email,
    logo_storage_path: patch.logo_storage_path ?? current.logo_storage_path,
    updated_at: new Date().toISOString()
  };

  const { error } = await db.from("tenant_company_profiles").upsert(row, { onConflict: "tenant_id" });
  if (error) throw error;
  return getTenantCompanyProfile(tenantId);
}

export function defaultTenantIdOr(tenantId?: string | null): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}
