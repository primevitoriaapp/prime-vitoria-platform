import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/domain/types";
import { db } from "@/lib/server/db";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { resolveDriverIdForUser } from "@/lib/drivers/resolve-driver-for-session";
import { resolveEffectiveUserRole } from "@/lib/auth/role-from-claims";

function cpfFromUserMetadata(user: User): string | undefined {
  const raw = user.user_metadata?.cpf ?? user.user_metadata?.document;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Papel efectivo após login (perfil, vínculo motorista por e-mail, claims JWT). */
export async function resolveLoginRole(user: User): Promise<UserRole> {
  const { data: profile } = await db
    .from("profiles")
    .select("role, tenant_id, client_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = (profile?.tenant_id as string | undefined) ?? DEFAULT_TENANT_ID;
  const driverId = await resolveDriverIdForUser({
    userId: user.id,
    tenantId,
    email: user.email,
    cpf: cpfFromUserMetadata(user)
  });

  return resolveEffectiveUserRole({
    user,
    profileRole: profile?.role,
    profileClientId: profile?.client_id,
    driverId
  });
}
