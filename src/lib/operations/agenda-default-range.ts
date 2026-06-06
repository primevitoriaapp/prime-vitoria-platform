import { brDateToEndOfDayIso, brDateToStartOfDayIso, normalizeDateFieldForStorage } from "@/lib/dates/br-date";

/** Intervalo predefinido da agenda: ontem 00:00 (local) até +365 dias. */
export function defaultAgendaRangeIso(): { fromIso: string; toIso: string } {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 365);

  const fromDate = normalizeDateFieldForStorage(
    `${String(yesterday.getDate()).padStart(2, "0")}/${String(yesterday.getMonth() + 1).padStart(2, "0")}/${yesterday.getFullYear()}`
  );
  const toDate = normalizeDateFieldForStorage(
    `${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}/${end.getFullYear()}`
  );

  return {
    fromIso: brDateToStartOfDayIso(fromDate!)!,
    toIso: brDateToEndOfDayIso(toDate!)!
  };
}
