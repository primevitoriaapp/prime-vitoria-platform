import { db } from "@/lib/server/db";

export type PassengerPermission = { passengerId: string; canRequest: boolean; allowed: string[] | null } | null;

/** Permissão do funcionário logado no portal (null = gestor ou sem cadastro de funcionário: vale o da empresa). */
export async function permissionForProfile(clientId: string, profileId: string): Promise<PassengerPermission> {
  const { data } = await db
    .from("client_passengers")
    .select("id, can_request, allowed_category_ids, active")
    .eq("client_id", clientId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return null;
  const allowed = (data.allowed_category_ids as string[] | null) ?? null;
  return { passengerId: data.id as string, canRequest: data.active !== false && data.can_request !== false, allowed: allowed && allowed.length ? allowed : null };
}

export function categoryAllowed(p: PassengerPermission, categoryId: string | null | undefined): boolean {
  if (!p || !p.allowed) return true;
  return !!categoryId && p.allowed.includes(categoryId);
}
