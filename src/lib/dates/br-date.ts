/** Formatação e conversão de datas no padrão brasileiro (DD/MM/AAAA). */

const BR_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const BR_DATETIME_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;

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
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return parseBrDateToIso(trimmed);
}

/** Converte DD/MM/AAAA HH:mm (ou ISO) para ISO datetime. */
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
    const d = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  const dateOnly = parseBrDateToIso(t);
  if (dateOnly) return new Date(`${dateOnly}T12:00:00`).toISOString();

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

/** Exibe DD/MM/AAAA HH:mm a partir de ISO datetime. */
export function formatBrDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const datePart = formatBrDate(value);
    return datePart || "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor inicial para DateInput a partir de ISO armazenado. */
export function isoToBrDateInput(value: string | null | undefined): string {
  return formatBrDate(value);
}

/** Valor inicial para DateTimeInput a partir de ISO armazenado. */
export function isoToBrDateTimeInput(value: string | null | undefined): string {
  return formatBrDateTime(value);
}

/** Início do dia local (filtros de agenda). */
export function brDateToStartOfDayIso(brOrIso: string): string | null {
  const isoDate = parseBrDateToIso(brOrIso);
  if (!isoDate) return null;
  return new Date(`${isoDate}T00:00:00`).toISOString();
}

/** Fim do dia local (filtros de agenda). */
export function brDateToEndOfDayIso(brOrIso: string): string | null {
  const isoDate = parseBrDateToIso(brOrIso);
  if (!isoDate) return null;
  return new Date(`${isoDate}T23:59:59.999`).toISOString();
}
