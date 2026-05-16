const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Fim do dia UTC (23:59:59.999Z) a partir de `YYYY-MM-DD`. */
export function endOfUtcDayIsoFromDateInput(yyyyMmDd: string): string | null {
  const s = yyyyMmDd.trim();
  if (!YMD.test(s)) return null;
  const d = new Date(`${s}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
