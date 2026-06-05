import { db } from "@/lib/server/db";
import type { SessionContext } from "@/lib/domain/types";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export function normalizeEmailForDriverMatch(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeCpfDigits(cpf: string | null | undefined): string {
  if (!cpf) return "";
  return cpf.replace(/\D/g, "");
}

function driverLinkAllowed(profileId: string | null | undefined, userId: string): boolean {
  return !profileId || profileId === userId;
}

/**
 * Resolve o registo `drivers.id` para a sessão actual.
 * Ordem: 1) profile_id · 2) e-mail · 3) CPF (user metadata / perfil).
 */
export async function resolveDriverIdForUser(opts: {
  userId: string;
  tenantId: string;
  email?: string | null;
  cpf?: string | null;
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
  if (email) {
    const normalized = normalizeEmailForDriverMatch(email);
    const { data: emailRows } = await db
      .from("drivers")
      .select("id, profile_id, email")
      .eq("tenant_id", tenantId)
      .not("email", "is", null);

    const byEmail = (emailRows ?? []).find(
      (row) =>
        row.email &&
        normalizeEmailForDriverMatch(String(row.email)) === normalized &&
        driverLinkAllowed(row.profile_id as string | null, userId)
    );
    if (byEmail?.id) return byEmail.id as string;
  }

  const cpfDigits = normalizeCpfDigits(opts.cpf);
  if (cpfDigits.length === 11) {
    const { data: cpfRows } = await db
      .from("drivers")
      .select("id, profile_id, cpf")
      .eq("tenant_id", tenantId);

    const byCpf = (cpfRows ?? []).find(
      (row) =>
        normalizeCpfDigits(String(row.cpf ?? "")) === cpfDigits &&
        driverLinkAllowed(row.profile_id as string | null, userId)
    );
    if (byCpf?.id) return byCpf.id as string;
  }

  return undefined;
}

/** Garante `session.driverId` para motorista (profile_id, e-mail ou CPF). */
export async function withResolvedDriverId(session: SessionContext): Promise<SessionContext> {
  if (session.driverId || session.role !== "motorista") return session;
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const driverId = await resolveDriverIdForUser({
    userId: session.userId,
    tenantId,
    email: session.email,
    cpf: session.cpf
  });
  return driverId ? { ...session, driverId } : session;
}

/** Valida se o `drivers.id` pertence à sessão. */
export async function driverBelongsToSession(
  driverId: string,
  session: SessionContext
): Promise<boolean> {
  const resolved = await withResolvedDriverId(session);
  if (resolved.driverId && resolved.driverId === driverId) return true;

  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const { data: row } = await db
    .from("drivers")
    .select("id, profile_id, email, cpf")
    .eq("id", driverId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!row) return false;
  if (row.profile_id === session.userId) return true;

  const email = session.email?.trim();
  if (email && row.email && driverLinkAllowed(row.profile_id as string | null, session.userId)) {
    if (normalizeEmailForDriverMatch(String(row.email)) === normalizeEmailForDriverMatch(email)) {
      return true;
    }
  }

  const cpfDigits = normalizeCpfDigits(session.cpf);
  if (
    cpfDigits.length === 11 &&
    driverLinkAllowed(row.profile_id as string | null, session.userId) &&
    normalizeCpfDigits(String(row.cpf ?? "")) === cpfDigits
  ) {
    return true;
  }

  return false;
}
