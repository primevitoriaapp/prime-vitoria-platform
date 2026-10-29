/** Importação de cadastros por planilha: reconhece as colunas e valida cada linha (funções puras). */

export type ImportKind = "clientes" | "motoristas";

export type FieldDef = { key: string; label: string; required?: boolean; aliases: string[] };

export const FIELDS: Record<ImportKind, FieldDef[]> = {
  clientes: [
    { key: "name", label: "Nome / Razão social", required: true, aliases: ["nome", "razao social", "razão social", "empresa", "cliente", "nome completo"] },
    { key: "trade_name", label: "Nome fantasia", aliases: ["nome fantasia", "fantasia", "apelido"] },
    { key: "document", label: "CNPJ ou CPF", aliases: ["cnpj", "cpf", "cnpj/cpf", "cpf/cnpj", "documento", "doc"] },
    { key: "email", label: "E-mail", aliases: ["email", "e-mail", "e mail"] },
    { key: "phone", label: "Telefone", aliases: ["telefone", "fone", "tel", "celular"] },
    { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whats", "zap"] },
    { key: "address_line", label: "Endereço", aliases: ["endereco", "endereço", "logradouro", "rua"] },
    { key: "city", label: "Cidade", aliases: ["cidade", "municipio", "município"] },
    { key: "state", label: "UF", aliases: ["uf", "estado"] },
    { key: "postal_code", label: "CEP", aliases: ["cep"] },
    { key: "notes", label: "Observações", aliases: ["observacoes", "observações", "obs"] }
  ],
  motoristas: [
    { key: "full_name", label: "Nome completo", required: true, aliases: ["nome", "nome completo", "motorista"] },
    { key: "cpf", label: "CPF", required: true, aliases: ["cpf", "documento"] },
    { key: "cnh_number", label: "CNH", aliases: ["cnh", "numero cnh", "nº cnh", "n cnh", "habilitacao", "habilitação"] },
    { key: "cnh_expiry", label: "Vencimento CNH", aliases: ["vencimento cnh", "validade cnh", "vencimento", "validade"] },
    { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whats", "zap", "celular"] },
    { key: "phone", label: "Telefone", aliases: ["telefone", "fone", "tel"] },
    { key: "email", label: "E-mail", aliases: ["email", "e-mail"] },
    { key: "employment_type", label: "Tipo (funcionário/parceiro)", aliases: ["tipo", "vinculo", "vínculo"] },
    { key: "pix_key", label: "Chave PIX", aliases: ["pix", "chave pix"] }
  ]
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Liga cada coluna da planilha a um campo do sistema pelo nome do cabeçalho. */
export function mapHeaders(kind: ImportKind, headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of FIELDS[kind]) {
    const names = [f.label, ...f.aliases].map(norm);
    const idx = headers.findIndex((h, i) => !used.has(i) && names.includes(norm(h)));
    if (idx >= 0) {
      out[f.key] = idx;
      used.add(idx);
    }
  }
  return out;
}

export const onlyDigits = (s: string) => s.replace(/\D+/g, "");

export function validCpf(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export function validCnpj(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, n, i) => acc + n * Number(c[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

/** "31/12/2027", "2027-12-31" ou número de data do Excel → "2027-12-31". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export type RowResult = {
  line: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
};

export function buildRows(
  kind: ImportKind,
  table: string[][],
  existingDocs: Set<string>
): { mapping: Record<string, number>; rows: RowResult[] } {
  const [headers = [], ...body] = table;
  const mapping = mapHeaders(kind, headers.map(String));
  const seen = new Set<string>();
  const rows: RowResult[] = [];
  body.forEach((cells, i) => {
    if (!cells.some((c) => String(c ?? "").trim())) return;
    const data: Record<string, string> = {};
    for (const [key, idx] of Object.entries(mapping)) data[key] = String(cells[idx] ?? "").trim();
    const errors: string[] = [];
    const warnings: string[] = [];
    let duplicate = false;

    if (kind === "clientes") {
      if ((data.name ?? "").length < 2) errors.push("sem nome");
      const doc = onlyDigits(data.document ?? "");
      if (doc) {
        if (doc.length === 11 && !validCpf(doc)) warnings.push("CPF parece errado");
        else if (doc.length === 14 && !validCnpj(doc)) warnings.push("CNPJ parece errado");
        else if (doc.length !== 11 && doc.length !== 14) warnings.push("documento com tamanho estranho");
        if (existingDocs.has(doc) || seen.has(doc)) duplicate = true;
        seen.add(doc);
      }
      data.type = doc.length === 11 ? "PF" : "PJ";
      if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
        warnings.push("e-mail inválido (vai em branco)");
        data.email = "";
      }
      if (data.state) data.state = data.state.slice(0, 2).toUpperCase();
    } else {
      if ((data.full_name ?? "").length < 2) errors.push("sem nome");
      const cpf = onlyDigits(data.cpf ?? "");
      if (!cpf) errors.push("sem CPF");
      else if (!validCpf(cpf)) errors.push("CPF inválido");
      else if (existingDocs.has(cpf) || seen.has(cpf)) duplicate = true;
      if (cpf) seen.add(cpf);
      if (data.cnh_expiry) {
        const d = parseDate(data.cnh_expiry);
        if (!d) {
          warnings.push("vencimento da CNH não entendido (vai em branco)");
          data.cnh_expiry = "";
        } else data.cnh_expiry = d;
      }
      const t = norm(data.employment_type ?? "");
      data.employment_type = t.startsWith("func") || t === "clt" ? "funcionario" : "parceiro";
      if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
        warnings.push("e-mail inválido (vai em branco)");
        data.email = "";
      }
    }
    rows.push({ line: i + 2, data, errors, warnings, duplicate });
  });
  return { mapping, rows };
}

/** CSV com ; ou , e aspas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function templateCsv(kind: ImportKind): string {
  const head = FIELDS[kind].map((f) => f.label);
  const example =
    kind === "clientes"
      ? ["Empresa Exemplo LTDA", "Exemplo", "11.222.333/0001-81", "contato@exemplo.com.br", "(27) 3333-4444", "(27) 99999-0000", "Av. Exemplo, 100", "Vitória", "ES", "29000-000", ""]
      : ["João da Silva", "529.982.247-25", "01234567890", "31/12/2027", "(27) 99999-0000", "", "joao@email.com", "parceiro", "joao@email.com"];
  return "﻿" + [head, example].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
}
