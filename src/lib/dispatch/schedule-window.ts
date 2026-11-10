/**
 * Janela que a corrida ocupa na agenda do motorista: sai 30 min antes (deslocamento)
 * e fica livre 30 min depois do fim previsto. Diária ocupa as horas contratadas.
 */
export type ScheduleTrip = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  service_mode?: string | null;
  planned_km?: number | null;
  origin_text?: string | null;
  destination_text?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
};

const placeKey = (s: string | null | undefined) =>
  String(s ?? "")
    .split(/[,\-–|]/)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function metersBetween(a: [number, number], b: [number, number]): number {
  const r = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * "Continuação": a corrida B começa onde a A termina (ex.: aeroporto → hotel, depois hotel → restaurante).
 * O motorista já está no lugar: não é conflito, mesmo com horários colados.
 */
export function isContinuation(first: ScheduleTrip, next: ScheduleTrip): boolean {
  if (!(Date.parse(first.scheduled_at) < Date.parse(next.scheduled_at))) return false;
  if (first.destination_lat != null && first.destination_lng != null && next.origin_lat != null && next.origin_lng != null) {
    if (metersBetween([Number(first.destination_lat), Number(first.destination_lng)], [Number(next.origin_lat), Number(next.origin_lng)]) <= 500) return true;
  }
  const a = placeKey(first.destination_text);
  const b = placeKey(next.origin_text);
  return a.length >= 5 && a === b;
}

const BUSY = new Set(["dispatched", "accepted", "reassigned", "on_the_way", "arrived", "in_progress"]);
const LIVE = new Set(["on_the_way", "arrived", "in_progress"]);
export const SCHEDULE_BUFFER_MIN = 30;

export function tripDurationMinutes(t: Pick<ScheduleTrip, "service_mode" | "planned_km">): number {
  const m = /^diaria_(\d+)h$/.exec(t.service_mode ?? "");
  if (m) return Number(m[1]) * 60;
  const km = Number(t.planned_km) || 0;
  // ~40 km/h na Grande Vitória, mínimo 1 h por transfer.
  return Math.max(60, Math.round((km / 40) * 60));
}

export function tripWindow(t: ScheduleTrip): { start: number; end: number } {
  const s = Date.parse(t.scheduled_at);
  return { start: s - SCHEDULE_BUFFER_MIN * 60000, end: s + (tripDurationMinutes(t) + SCHEDULE_BUFFER_MIN) * 60000 };
}

/** Corrida do motorista que bate com a nova (ou que ele está fazendo agora, se a nova é imediata). */
export function findScheduleConflict(target: ScheduleTrip, others: ScheduleTrip[], now = Date.now()): ScheduleTrip | null {
  const w = tripWindow(target);
  if (!Number.isFinite(w.start)) return null;
  const immediate = Date.parse(target.scheduled_at) - now < 2 * 3600000;
  for (const o of others) {
    if (o.id === target.id || !BUSY.has(o.operational_status)) continue;
    // Uma termina onde a outra começa: o motorista emenda, não é conflito.
    if (isContinuation(o, target) || isContinuation(target, o)) continue;
    if (immediate && LIVE.has(o.operational_status)) return o;
    const ow = tripWindow(o);
    if (ow.start < w.end && w.start < ow.end) return o;
  }
  return null;
}

export function conflictText(o: ScheduleTrip): string {
  const fmt = (ms: number, withDay: boolean) =>
    new Date(ms).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      ...(withDay ? { day: "2-digit", month: "2-digit" } : {}),
      hour: "2-digit",
      minute: "2-digit"
    });
  const start = Date.parse(o.scheduled_at);
  const end = start + tripDurationMinutes(o) * 60000;
  const kind = /^diaria_(\d+)h$/.exec(o.service_mode ?? "") ? `diária ${tripDurationMinutes(o) / 60}h` : "corrida";
  if (LIVE.has(o.operational_status)) return `está em corrida agora (${kind} das ${fmt(start, false)})`;
  return `tem ${kind} em ${fmt(start, true)} até ~${fmt(end, false)}`;
}
