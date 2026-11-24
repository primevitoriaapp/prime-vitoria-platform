import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";

export type ClubDriver = { id: string; tenantId: string; full_name: string; profile_name: string | null; photo_url: string | null; eligible: boolean; reason: string | null };

/** Motorista logado no app + elegibilidade no Prime Club (ativo e não bloqueado). */
export async function clubDriver(): Promise<{ driver: ClubDriver | null; denied: Response | null }> {
  const session = await withResolvedDriverId(await getSessionContext());
  if (session.role !== "motorista" || !session.driverId) return { driver: null, denied: fail("FORBIDDEN", "Entre no app do motorista", 403) };
  const tenantId = assertTenantScope(session);
  const { data: d } = await db
    .from("drivers")
    .select("id, full_name, photo_url, active, club_blocked")
    .eq("id", session.driverId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!d) return { driver: null, denied: fail("NOT_FOUND", "Motorista não encontrado", 404) };
  const reason = d.club_blocked ? "Seu acesso ao clube está suspenso. Fale com a central." : d.active === false ? "Cadastro inativo. Fale com a central." : null;
  return {
    driver: {
      id: String(d.id),
      tenantId,
      full_name: String(d.full_name ?? ""),
      profile_name: null,
      photo_url: (d.photo_url as string | null) ?? null,
      eligible: !reason,
      reason
    },
    denied: null
  };
}

/** Identificação curta e não sensível do motorista na carteirinha (não é CPF). */
export const memberNumber = (driverId: string) => `PV-${driverId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
