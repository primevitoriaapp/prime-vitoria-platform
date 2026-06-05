import { db } from "@/lib/server/db";
import type { SessionContext } from "@/lib/domain/types";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve o registo `drivers.id` para a sessão actual.
 * Ordem: profile_id → e-mail (drivers sem profile_id) → cabeçalho x-driver-id (sessão).
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

  const email = opts.email?.trim();
  if (!email) return undefined;

  const normalized = normalizeEmail(email);

  const { data: unlinked } = await db
    .from("drivers")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .is("profile_id", null);

  const byEmail = (unlinked ?? []).find(
    (row) => row.email && normalizeEmail(String(row.email)) === normalized
  );
  if (byEmail?.id) return byEmail.id as string;

  const { data: byIlike } = await db
    .from("drivers")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("profile_id", null)
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();

  if (byIlike?.id) return byIlike.id as string;

  return undefined;
}

/** Garante `session.driverId` para motorista (profile_id ou e-mail do login). */
export async function withResolvedDriverId(session: SessionContext): Promise<SessionContext> {
  if (session.driverId || session.role !== "motorista") return session;
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const driverId = await resolveDriverIdForUser({
    userId: session.userId,
    tenantId,
    email: session.email
  });
  return driverId ? { ...session, driverId } : session;
}

/** Valida se o `drivers.id` pertence à sessão (profile_id ou e-mail sem profile_id). */
export async function driverBelongsToSession(
  driverId: string,
  session: SessionContext
): Promise<boolean> {
  const resolved = await withResolvedDriverId(session);
  if (resolved.driverId && resolved.driverId === driverId) return true;

  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const { data: row } = await db
    .from("drivers")
    .select("id, profile_id, email")
    .eq("id", driverId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!row) return false;
  if (row.profile_id === session.userId) return true;

  const email = session.email?.trim();
  if (!row.profile_id && email && row.email) {
    return normalizeEmail(String(row.email)) === normalizeEmail(email);
  }

  return false;
}
