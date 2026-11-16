import { db } from "@/lib/server/db";

export type SignupLead = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  details: Record<string, unknown>;
  status: string;
  complete_data: Record<string, unknown> | null;
  complete_files: Record<string, string>;
  completed_at: string | null;
};

/** Candidato pelo link único do cadastro completo. Só motoristas, nunca descartados. */
export async function leadBySignupToken(token: string): Promise<SignupLead | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await db
    .from("site_leads")
    .select("id, tenant_id, name, phone, email, city, details, status, complete_data, complete_files, completed_at, kind")
    .eq("complete_token", token)
    .maybeSingle();
  if (!data || data.kind !== "motorista" || data.status === "descartado") return null;
  return data as unknown as SignupLead;
}

export const signupFolder = (lead: { tenant_id: string; id: string }) => `${lead.tenant_id}/candidatos/${lead.id}/`;
