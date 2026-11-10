/** Aniversários e vencimentos de documentos dos motoristas (funções puras). */
const TZ = "America/Sao_Paulo";

export function todayYmd(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: TZ });
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "today" | "yesterday" | dias até o próximo aniversário (1..7) | null. */
export function birthdayStatus(birthDate: string | null | undefined, now = new Date()): "today" | "yesterday" | number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null;
  const md = birthDate.slice(5, 10);
  const t = todayYmd(now);
  if (t.slice(5) === md) return "today";
  if (addDays(t, -1).slice(5) === md) return "yesterday";
  for (let i = 1; i <= 7; i++) if (addDays(t, i).slice(5) === md) return i;
  return null;
}

export function ageOn(birthDate: string, now = new Date()): number {
  const t = todayYmd(now);
  let age = Number(t.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (t.slice(5) < birthDate.slice(5, 10)) age -= 1;
  return age;
}

/** Dias até vencer (negativo = vencido). null quando não há data. */
export function daysUntil(dateLike: string | null | undefined, now = new Date()): number | null {
  if (!dateLike) return null;
  const ymd = String(dateLike).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const a = Date.parse(`${todayYmd(now)}T12:00:00Z`);
  const b = Date.parse(`${ymd}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export type DocAlert = { doc: "CNH" | "Seguro" | "Licenciamento" | "Antecedentes"; days: number; date: string; level: "vencido" | "urgente" | "atencao" };

/** Avisa a partir de 30 dias antes; urgente com 7 dias ou menos. */
export function docAlert(doc: DocAlert["doc"], date: string | null | undefined, now = new Date()): DocAlert | null {
  const d = daysUntil(date, now);
  if (d == null || d > 30) return null;
  return { doc, days: d, date: String(date).slice(0, 10), level: d < 0 ? "vencido" : d <= 7 ? "urgente" : "atencao" };
}

export function docAlertText(a: DocAlert): string {
  if (a.days < 0 && a.doc === "Antecedentes") return `Certidão de antecedentes VENCIDA há ${-a.days} dia(s)`;
  if (a.days < 0) return `${a.doc} VENCIDA há ${-a.days} dia(s)`;
  if (a.days === 0) return `${a.doc} vence HOJE`;
  return `${a.doc} vence em ${a.days} dia(s) (${a.date.split("-").reverse().join("/")})`;
}
