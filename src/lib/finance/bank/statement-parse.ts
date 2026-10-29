/** Leitura de extrato bancário (OFX e CSV) e sugestão de conciliação. Funções puras. */

export type StatementLine = {
  fit_id: string;
  posted_at: string; // AAAA-MM-DD
  amount: number; // + entrada, - saída
  description: string;
};

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : null;
}

function ofxDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function num(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  // OFX usa ponto; alguns bancos mandam vírgula.
  const n = Number(t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/,(?=\d{3}\b)/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** OFX 1.x (SGML) e 2.x (XML): pega cada <STMTTRN>. */
export function parseOfx(text: string): { lines: StatementLine[]; account: { bank: string | null; agency: string | null; account: string | null } } {
  const lines: StatementLine[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((b, i) => {
    const block = b.split(/<\/STMTTRN>/i)[0];
    const date = ofxDate(tag(block, "DTPOSTED"));
    const amount = num(tag(block, "TRNAMT"));
    if (!date || amount == null) return;
    const memo = [tag(block, "NAME"), tag(block, "MEMO")].filter(Boolean).join(" · ");
    const fit = tag(block, "FITID") || `${date}-${amount}-${i}`;
    lines.push({ fit_id: fit, posted_at: date, amount, description: memo || "(sem descrição)" });
  });
  return {
    lines,
    account: { bank: tag(text, "BANKID"), agency: tag(text, "BRANCHID"), account: tag(text, "ACCTID") }
  };
}

function brDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function brMoney(raw: string): number | null {
  let t = raw.replace(/R\$|\s/g, "");
  if (!t) return null;
  const neg = /^-|\(.*\)|D$/i.test(t);
  t = t.replace(/[()CD+-]/gi, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * CSV de extrato: acha as colunas de data, descrição e valor pelo cabeçalho.
 * Aceita valor único (com sinal) ou colunas separadas de crédito e débito.
 */
export function parseStatementCsv(table: string[][]): StatementLine[] {
  const headerIdx = table.findIndex((r) => r.some((c) => /data/.test(norm(c))) && r.some((c) => /valor|credito|debito|entrada|saida/.test(norm(c))));
  if (headerIdx < 0) return [];
  const h = table[headerIdx].map(norm);
  const find = (re: RegExp) => h.findIndex((c) => re.test(c));
  const iDate = find(/^data/);
  const iDesc = find(/descri|historico|lancamento|detalhe|memo/);
  const iVal = find(/^valor/);
  const iCred = find(/credito|entrada/);
  const iDeb = find(/debito|saida/);
  const out: StatementLine[] = [];
  const seen = new Map<string, number>();
  table.slice(headerIdx + 1).forEach((r) => {
    const date = brDate(String(r[iDate] ?? ""));
    if (!date) return;
    let amount: number | null = null;
    if (iVal >= 0) amount = brMoney(String(r[iVal] ?? ""));
    else {
      const c = iCred >= 0 ? brMoney(String(r[iCred] ?? "")) : null;
      const d = iDeb >= 0 ? brMoney(String(r[iDeb] ?? "")) : null;
      amount = c ? Math.abs(c) : d ? -Math.abs(d) : null;
    }
    if (amount == null || amount === 0) return;
    const desc = iDesc >= 0 ? String(r[iDesc] ?? "").trim() : "";
    if (/saldo/i.test(desc) && !/pix|ted|doc/i.test(desc)) return;
    // Identificador estável: o mesmo lançamento num extrato que se sobrepõe não entra duas vezes.
    const key = `csv|${date}|${amount}|${norm(desc).replace(/\s+/g, " ").slice(0, 60)}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push({ fit_id: `${key}|${n}`, posted_at: date, amount, description: desc || "(sem descrição)" });
  });
  return out;
}

export type Candidate = {
  kind: "fatura" | "recebivel" | "conta_pagar" | "repasse";
  id: string;
  amount: number;
  date: string; // vencimento
  label: string; // nome do cliente / fornecedor / motorista
};

export type Suggestion = { candidate: Candidate; score: number; reason: string };

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;
}

function nameHit(desc: string, label: string): boolean {
  const d = norm(desc);
  const words = norm(label)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !["ltda", "eireli", "comercio", "servicos", "transporte", "empresa"].includes(w));
  return words.some((w) => d.includes(w));
}

/**
 * Sugere com o que o lançamento do extrato bate.
 * Entrada → faturas e recebíveis; saída → contas a pagar e repasses. Valor precisa ser igual (centavos).
 */
export function suggestMatches(line: StatementLine, candidates: Candidate[], max = 3): Suggestion[] {
  const credit = line.amount > 0;
  const pool = candidates.filter((c) => (credit ? c.kind === "fatura" || c.kind === "recebivel" : c.kind === "conta_pagar" || c.kind === "repasse"));
  const target = Math.abs(line.amount);
  const out: Suggestion[] = [];
  for (const c of pool) {
    if (Math.abs(c.amount - target) > 0.009) continue;
    const days = daysBetween(line.posted_at, c.date);
    let score = 60;
    const reasons = ["mesmo valor"];
    if (days <= 3) {
      score += 20;
      reasons.push("data próxima");
    } else if (days <= 15) score += 10;
    else if (days > 60) score -= 30;
    if (nameHit(line.description, c.label)) {
      score += 25;
      reasons.push("nome confere");
    }
    out.push({ candidate: c, score: Math.min(score, 100), reason: reasons.join(", ") });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}
