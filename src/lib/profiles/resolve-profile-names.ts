import { db } from "@/lib/server/db";

/** Mapa profile_id → nome para enriquecer timelines e filas. */
export async function resolveProfileNames(profileIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return {};

  const { data } = await db.from("profiles").select("id, name").in("id", ids);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.name) out[row.id] = row.name;
  }
  return out;
}
