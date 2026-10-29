import { db } from "@/lib/server/db";
import { conflictText, findScheduleConflict, type ScheduleTrip } from "@/lib/dispatch/schedule-window";

const COLS = "id, scheduled_at, operational_status, service_mode, planned_km";

/** Verifica se o motorista já tem corrida no horário da corrida-alvo. Devolve a mensagem para a central, ou null. */
export async function driverScheduleConflictMessage(tenantId: string, driverId: string, driverName: string | null, target: ScheduleTrip): Promise<string | null> {
  const from = new Date(Date.parse(target.scheduled_at) - 2 * 86400000).toISOString();
  const to = new Date(Date.parse(target.scheduled_at) + 2 * 86400000).toISOString();
  const [{ data: near }, { data: live }] = await Promise.all([
    db.from("trips").select(COLS).eq("tenant_id", tenantId).eq("driver_id", driverId).gte("scheduled_at", from).lte("scheduled_at", to).limit(200),
    db.from("trips").select(COLS).eq("tenant_id", tenantId).eq("driver_id", driverId).in("operational_status", ["on_the_way", "arrived", "in_progress"]).limit(20)
  ]);
  const seen = new Set<string>();
  const others = [...(near ?? []), ...(live ?? [])].filter((t) => (seen.has(t.id as string) ? false : (seen.add(t.id as string), true))) as ScheduleTrip[];
  const c = findScheduleConflict(target, others);
  if (!c) return null;
  return `${driverName?.trim() || "Este motorista"} ${conflictText(c)}. Escolha outro motorista ou mude o horário.`;
}

/** Para a lista de motoristas: quem está ocupado no horário desta corrida, com o motivo. */
export async function busyDriversForTrip(tenantId: string, target: ScheduleTrip): Promise<Record<string, string>> {
  const from = new Date(Date.parse(target.scheduled_at) - 2 * 86400000).toISOString();
  const to = new Date(Date.parse(target.scheduled_at) + 2 * 86400000).toISOString();
  const [{ data: near }, { data: live }] = await Promise.all([
    db.from("trips").select(`${COLS}, driver_id`).eq("tenant_id", tenantId).not("driver_id", "is", null).gte("scheduled_at", from).lte("scheduled_at", to).limit(2000),
    db.from("trips").select(`${COLS}, driver_id`).eq("tenant_id", tenantId).in("operational_status", ["on_the_way", "arrived", "in_progress"]).limit(200)
  ]);
  const byDriver = new Map<string, ScheduleTrip[]>();
  const seen = new Set<string>();
  for (const t of [...(near ?? []), ...(live ?? [])]) {
    if (seen.has(t.id as string)) continue;
    seen.add(t.id as string);
    const d = t.driver_id as string;
    byDriver.set(d, [...(byDriver.get(d) ?? []), t as ScheduleTrip]);
  }
  const out: Record<string, string> = {};
  for (const [d, list] of byDriver) {
    const c = findScheduleConflict(target, list);
    if (c) out[d] = conflictText(c);
  }
  return out;
}
