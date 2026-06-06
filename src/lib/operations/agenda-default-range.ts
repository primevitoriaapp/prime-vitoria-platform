import {
  brDateToEndOfDayIso,
  brDateToStartOfDayIso,
  saoPauloYmdFromDate
} from "@/lib/dates/br-date";

/** Intervalo predefinido da agenda: ontem 00:00 (Brasília) até +365 dias. */
export function defaultAgendaRangeIso(): { fromIso: string; toIso: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const end = new Date(now.getTime() + 365 * 86_400_000);

  const fromDate = saoPauloYmdFromDate(yesterday);
  const toDate = saoPauloYmdFromDate(end);

  return {
    fromIso: brDateToStartOfDayIso(fromDate)!,
    toIso: brDateToEndOfDayIso(toDate)!
  };
}
