import { db } from "@/lib/server/db";

/**
 * Resolve o registo `drivers.id` para a sessão actual.
 * Ordem: profile_id → e-mail (cadastro motorista) → cabeçalho x-driver-id (já tratado na sessão).
 */
export async function resolveDriverIdForUser(opts: {
  userId: string;
  tenantId: string;
  email?: string | null;
}): Promise<string | undefined> {
  const { userId, tenantId } = opts;

  const { data: byProfile } = await db
    .from("drivers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (byProfile?.id) return byProfile.id as string;

  const email = opts.email?.trim().toLowerCase();
  if (email) {
    const { data: byEmail } = await db
      .from("drivers")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", email)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (byEmail?.id) return byEmail.id as string;
  }

  return undefined;
}
