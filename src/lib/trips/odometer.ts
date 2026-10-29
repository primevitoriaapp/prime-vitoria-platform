/** KM do painel do carro (odômetro) digitado pelo motorista. Aceita "45.230", "45230", "45230,5". */
export function parseOdometer(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 10) / 10 : null;
  let s = raw.trim().replace(/\s|km/gi, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n < 10_000_000 ? Math.round(n * 10) / 10 : null;
}

export const MAX_TRIP_KM = 1500;

/** Distância da corrida pela diferença do painel, com as checagens de erro de digitação. */
export function odometerDistance(start: number | null, end: number | null): { ok: true; km: number } | { ok: false; message: string } {
  if (start == null) return { ok: false, message: "Falta o KM inicial do painel." };
  if (end == null) return { ok: false, message: "Informe o KM final do painel." };
  if (end <= start) return { ok: false, message: `O KM final precisa ser maior que o inicial (${start.toLocaleString("pt-BR")}).` };
  const km = Math.round((end - start) * 10) / 10;
  if (km > MAX_TRIP_KM) return { ok: false, message: `Deu ${km.toLocaleString("pt-BR")} km. Confira se digitou o KM certo.` };
  return { ok: true, km };
}
