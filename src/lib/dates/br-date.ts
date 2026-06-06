/** Formatação e conversão de datas no padrão brasileiro (DD/MM/AAAA), fuso America/Sao_Paulo. */

export const SAO_PAULO_TZ = "America/Sao_Paulo";

const BR_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const BR_DATETIME_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
const ISO_NAIVE_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

const brDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const brTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const saoPauloYmdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function formatterPart(
  formatter: Intl.DateTimeFormat,
  date: Date,
  type: Intl.DateTimeFormatPartTypes
): string {
  return formatter.formatToParts(date).find((p) => p.type === type)?.value ?? "";
}

/** Componentes de calendário (YYYY-MM-DD) no fuso de Brasília. */
export function saoPauloYmdFromDate(date: Date): string {
  return saoPauloYmdFormatter.format(date);
}

function saoPauloLocalToUtcIso(isoDate: string, hour: number, minute: number, second = 0, ms = 0): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return new Date(
    `${isoDate}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(ms, 3)}-03:00`
  ).toISOString();
}

export function maskBrDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function maskBrDateTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  const datePart = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  if (digits.length <= 10) return `${datePart} ${digits.slice(8)}`;
  return `${datePart} ${digits.slice(8, 10)}:${digits.slice(10)}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Converte DD/MM/AAAA ou YYYY-MM-DD para YYYY-MM-DD (ISO date). */
export function parseBrDateToIso(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;

  const br = BR_DATE_RE.exec(t);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const iso = ISO_DATE_RE.exec(t);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${year}-${iso[2]}-${iso[3]}`;
  }

  return null;
}

/** Aceita ISO, BR date ou BR datetime; devolve YYYY-MM-DD para colunas date. */
export function normalizeDateFieldForStorage(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.includes("T") || trimmed.includes(" ")) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return saoPauloYmdFromDate(d);
    }
  }
  return parseBrDateToIso(trimmed);
}

/** Converte DD/MM/AAAA HH:mm (horário de Brasília) para ISO UTC. */
export function parseBrDateTimeToIso(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;

  const br = BR_DATETIME_RE.exec(t);
  if (br) {
    const isoDate = parseBrDateToIso(`${br[1]}/${br[2]}/${br[3]}`);
    if (!isoDate) return null;
    const hour = Number(br[4]);
    const minute = Number(br[5]);
    if (hour > 23 || minute > 59) return null;
    return saoPauloLocalToUtcIso(isoDate, hour, minute);
  }

  return normalizeScheduledAtForStorage(t);
}

/**
 * Normaliza datetime de corrida para armazenamento (timestamptz UTC).
 * BR → Brasília; ISO sem offset → Brasília; ISO com Z/offset → instante absoluto.
 */
export function normalizeScheduledAtForStorage(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;

  const br = BR_DATETIME_RE.exec(t);
  if (br) {
    const isoDate = parseBrDateToIso(`${br[1]}/${br[2]}/${br[3]}`);
    if (!isoDate) return null;
    const hour = Number(br[4]);
    const minute = Number(br[5]);
    if (hour > 23 || minute > 59) return null;
    return saoPauloLocalToUtcIso(isoDate, hour, minute);
  }

  if (t.includes("Z") || /[+-]\d{2}:\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const naive = ISO_NAIVE_DATETIME_RE.exec(t);
  if (naive) {
    const hour = Number(naive[2]);
    const minute = Number(naive[3]);
    const second = naive[4] ? Number(naive[4]) : 0;
    if (hour > 23 || minute > 59 || second > 59) return null;
    return saoPauloLocalToUtcIso(naive[1], hour, minute, second);
  }

  const dateOnly = parseBrDateToIso(t);
  if (dateOnly) return saoPauloLocalToUtcIso(dateOnly, 12, 0);

  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  return null;
}

/** Exibe DD/MM/AAAA a partir de ISO ou YYYY-MM-DD. */
export function formatBrDate(value: string | null | undefined): string {
  const iso = normalizeDateFieldForStorage(value);
  if (!iso) return "";
  const [, y, m, d] = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!y) return "";
  return `${d}/${m}/${y}`;
}

/** Exibe DD/MM/AAAA HH:mm em America/Sao_Paulo. */
export function formatBrDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const datePart = formatBrDate(value);
    return datePart || "";
  }
  const day = formatterPart(brDateTimeFormatter, d, "day");
  const month = formatterPart(brDateTimeFormatter, d, "month");
  const year = formatterPart(brDateTimeFormatter, d, "year");
  const hour = formatterPart(brDateTimeFormatter, d, "hour");
  const minute = formatterPart(brDateTimeFormatter, d, "minute");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/** Exibe HH:mm em America/Sao_Paulo. */
export function formatBrTime(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return brTimeFormatter.format(d);
}

/** Valor inicial para DateInput a partir de ISO armazenado. */
export function isoToBrDateInput(value: string | null | undefined): string {
  return formatBrDate(value);
}

/** Valor inicial para DateTimeInput a partir de ISO armazenado. */
export function isoToBrDateTimeInput(value: string | null | undefined): string {
  return formatBrDateTime(value);
}

/** Início do dia em Brasília (filtros de agenda). */
export function brDateToStartOfDayIso(brOrIso: string): string | null {
  const isoDate = parseBrDateToIso(brOrIso);
  if (!isoDate) return null;
  return saoPauloLocalToUtcIso(isoDate, 0, 0, 0, 0);
}

/** Fim do dia em Brasília (filtros de agenda). */
export function brDateToEndOfDayIso(brOrIso: string): string | null {
  const isoDate = parseBrDateToIso(brOrIso);
  if (!isoDate) return null;
  return saoPauloLocalToUtcIso(isoDate, 23, 59, 59, 999);
}

export type BrAgendaDateGroup = "overdue" | "today" | "tomorrow" | "upcoming";

/** Agrupa corrida por dia relativo a «hoje» em Brasília. */
export function tripAgendaDateGroup(scheduledAt: string): BrAgendaDateGroup {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return "upcoming";

  const tripYmd = saoPauloYmdFromDate(d);
  const todayYmd = saoPauloYmdFromDate(new Date());

  const [ty, tm, td] = tripYmd.split("-").map(Number);
  const [cy, cm, cd] = todayYmd.split("-").map(Number);
  const tripDay = Date.UTC(ty, tm - 1, td);
  const today = Date.UTC(cy, cm - 1, cd);
  const diffDays = Math.round((tripDay - today) / 86_400_000);

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return "upcoming";
}
