import { db } from "@/lib/server/db";

export type DriverMessage = {
  id: string;
  title: string;
  body: string;
  contact_hint: string | null;
  ask_interest: boolean;
  target_category_ids: string[] | null;
  created_at: string;
  expires_at: string | null;
  active: boolean;
};

/** Motoristas ativos que recebem o aviso (todos, ou só das categorias escolhidas). */
export async function targetDriverIds(tenantId: string, categoryIds: string[] | null): Promise<string[]> {
  const { data } = await db.from("drivers").select("id, vehicle_category_ids").eq("tenant_id", tenantId).eq("active", true);
  return (data ?? [])
    .filter((d) => {
      if (!categoryIds?.length) return true;
      const mine = (d.vehicle_category_ids as string[] | null) ?? [];
      return mine.some((c) => categoryIds.includes(c));
    })
    .map((d) => d.id as string);
}

export function isLive(m: Pick<DriverMessage, "active" | "expires_at">, now = Date.now()): boolean {
  return m.active && (!m.expires_at || Date.parse(m.expires_at) > now);
}
