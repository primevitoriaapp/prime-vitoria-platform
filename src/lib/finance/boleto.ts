/** Leitura de boleto pela linha digitável (padrão FEBRABAN) e pelo texto do PDF. Funções puras. */

export type BoletoInfo = {
  kind: "bancario" | "arrecadacao";
  line: string; // só números
  bank: string | null;
  amount: number | null;
  dueDate: string | null; // AAAA-MM-DD
  segment: string | null; // arrecadação: 1 prefeitura, 2 saneamento, 3 energia/gás, 4 telecom, 5 governo…
};

const BANKS: Record<string, string> = {
  "001": "Banco do Brasil", "033": "Santander", "104": "Caixa", "237": "Bradesco", "341": "Itaú", "756": "Sicoob", "748": "Sicredi",
  "077": "Inter", "260": "Nubank", "336": "C6 Bank", "422": "Safra", "041": "Banrisul", "021": "Banestes", "212": "Original",
  "655": "Votorantim", "208": "BTG", "380": "PicPay", "323": "Mercado Pago", "403": "Cora", "197": "Stone", "290": "PagSeguro", "070": "BRB"
};

const DAY = 86400000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Fator de vencimento: base 07/10/1997; a partir de 22/02/2025 o fator recomeça em 1000. Usa o mais perto de hoje. */
export function dueFromFactor(factor: number, today = new Date()): string | null {
  if (!factor) return null;
  const old = Date.UTC(1997, 9, 7) + factor * DAY;
  const neu = factor >= 1000 ? Date.UTC(2025, 1, 22) + (factor - 1000) * DAY : null;
  const now = today.getTime();
  const pick = neu != null && Math.abs(neu - now) < Math.abs(old - now) ? neu : old;
  return ymd(pick);
}

function mod10(num: string): number {
  let sum = 0;
  let w = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * w;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    sum += p;
    w = w === 2 ? 1 : 2;
  }
  const r = sum % 10;
  return r === 0 ? 0 : 10 - r;
}

/** Confere os dígitos dos campos da linha (evita pegar um número qualquer do PDF). */
export function validLine(d: string): boolean {
  if (d.length === 47) {
    return mod10(d.slice(0, 9)) === Number(d[9]) && mod10(d.slice(10, 20)) === Number(d[20]) && mod10(d.slice(21, 31)) === Number(d[31]);
  }
  if (d.length === 48 && d[0] === "8") {
    if (!["6", "7"].includes(d[2])) return true; // DV por módulo 11: aceita
    for (let b = 0; b < 4; b++) {
      const block = d.slice(b * 12, b * 12 + 11);
      if (mod10(block) !== Number(d[b * 12 + 11])) return false;
    }
    return true;
  }
  return false;
}

export function parseBoletoLine(raw: string, today = new Date()): BoletoInfo | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 47) {
    const factor = Number(d.slice(33, 37));
    const cents = Number(d.slice(37, 47));
    return { kind: "bancario", line: d, bank: BANKS[d.slice(0, 3)] ?? null, amount: cents ? cents / 100 : null, dueDate: dueFromFactor(factor, today), segment: null };
  }
  if (d.length === 48 && d[0] === "8") {
    const bar = [0, 1, 2, 3].map((b) => d.slice(b * 12, b * 12 + 11)).join("");
    const real = ["6", "7"].includes(bar[2]);
    const cents = Number(bar.slice(4, 15));
    return { kind: "arrecadacao", line: d, bank: null, amount: real && cents ? cents / 100 : null, dueDate: null, segment: bar[1] };
  }
  return null;
}

/** Acha a linha digitável no texto do PDF (com pontos e espaços ou só números). */
export function findBoletoLine(text: string): string | null {
  const t = text.replace(/ /g, " ");
  const bancario = /\d{5}[.\s]?\d{5}\s+\d{5}[.\s]?\d{6}\s+\d{5}[.\s]?\d{6}\s+\d\s+\d{14}/g;
  const arrec = /8\d{10}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d/g;
  for (const re of [bancario, arrec]) {
    for (const m of t.matchAll(re)) {
      const d = m[0].replace(/\D/g, "");
      if (validLine(d)) return d;
    }
  }
  for (const m of t.matchAll(/\d{47,48}/g)) if (validLine(m[0])) return m[0];
  return null;
}

/** Beneficiário, CNPJ, vencimento e valor escritos no boleto. */
export function boletoTextFields(text: string): { beneficiary: string | null; cnpj: string | null; dueDate: string | null; amount: number | null } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let beneficiary: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:benefici[aá]rio|cedente)(?:\s+final)?\s*[:\-]?\s*(.*)$/i);
    if (!m) continue;
    let name = m[1].replace(/(?:CNPJ|CPF)[:\s].*$/i, "").replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*$/, "").trim();
    if (name.length < 3 && lines[i + 1]) name = lines[i + 1].replace(/(?:CNPJ|CPF)[:\s].*$/i, "").replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*$/, "").trim();
    if (name.length >= 3 && !/ag[eê]ncia|c[oó]digo/i.test(name)) {
      beneficiary = name.replace(/\s+-\s*$/, "").slice(0, 120);
      break;
    }
  }
  const cnpj = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0] ?? null;
  const v = text.match(/vencimento[^\d]{0,20}(\d{2})\/(\d{2})\/(\d{4})/i);
  const val = text.match(/valor\s+(?:do\s+)?(?:documento|cobrado|a\s+pagar)?[^\d]{0,15}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return {
    beneficiary,
    cnpj,
    dueDate: v ? `${v[3]}-${v[2]}-${v[1]}` : null,
    amount: val ? Number(val[1].replace(/\./g, "").replace(",", ".")) : null
  };
}

const RULES: [RegExp, string][] = [
  [/contab|contador|escrit[oó]rio cont/i, "contabilidade"],
  [/posto|combust|ipiranga|shell|ale combust|petrobras distrib|br mania|raizen/i, "combustivel"],
  [/seguro|seguradora|porto seguro|tokio|allianz|mapfre|hdi|youse/i, "seguro"],
  [/detran|ipva|licenciamento/i, "ipva_licenciamento"],
  [/receita federal|simples nacional|\bdas\b|prefeitura|sefaz|\bdare\b|\bdarf\b|\binss\b|\bfgts\b|munic[ií]pio/i, "impostos"],
  [/vivo|claro|\btim\b|\boi\b|net servi|internet|telecom|telef[oô]nica|starlink/i, "telefone_internet"],
  [/aluguel|condom[ií]nio|imobili[aá]ria/i, "aluguel"],
  [/financ|leasing|cons[oó]rcio|localiza|movida|unidas|aymor[eé]|bv financeira/i, "financiamento"],
  [/google|microsoft|adobe|software|sistema|vercel|supabase|omie|conta azul|totvs|z-api|zapi/i, "sistemas"],
  [/oficina|pneu|auto ?pe[cç]as|mec[aâ]nic|funilaria|lava ?jato|concession[aá]ria/i, "manutencao"],
  [/marketing|publicidade|facebook|meta platforms|ag[eê]ncia de/i, "marketing"]
];

/** Categoria sugerida: primeiro o histórico daquele fornecedor, depois palavras do nome, depois o tipo do boleto. */
export function suggestCategory(beneficiary: string | null, segment: string | null, history?: string | null): string {
  if (history) return history;
  for (const [re, cat] of RULES) if (beneficiary && re.test(beneficiary)) return cat;
  if (segment === "1" || segment === "5") return "impostos";
  if (segment === "4") return "telefone_internet";
  return "outros";
}
