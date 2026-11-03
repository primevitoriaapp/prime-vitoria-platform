/** Importação de funcionários da empresa (portal do cliente) por planilha — funções puras. */
import { onlyDigits, validCpf } from "./sheet-import.ts";

export type TeamField = { key: string; label: string; required?: boolean; aliases: string[] };

export const TEAM_FIELDS: TeamField[] = [
  { key: "name", label: "Nome", required: true, aliases: ["nome", "nome completo", "funcionario", "funcionário", "colaborador"] },
  { key: "cpf", label: "CPF", aliases: ["cpf", "documento"] },
  { key: "email", label: "E-mail", aliases: ["email", "e-mail", "e mail"] },
  { key: "phone", label: "Telefone", aliases: ["telefone", "celular", "whatsapp", "fone", "tel"] },
  { key: "address", label: "Endereço", aliases: ["endereco", "endereço", "endereço completo", "residencia", "residência", "rua"] },
  { key: "postal_code", label: "CEP", aliases: ["cep"] },
  { key: "sector", label: "Setor", aliases: ["setor", "departamento", "area", "área"] },
  { key: "matricula", label: "Matrícula", aliases: ["matricula", "matrícula", "registro", "id"] },
  { key: "can_request", label: "Pode pedir corrida", aliases: ["pode pedir corrida", "pode solicitar", "solicita", "acesso", "pode pedir"] },
  { key: "categories", label: "Categorias permitidas", aliases: ["categorias permitidas", "categorias", "categoria", "veiculos", "veículos", "tipo de carro"] }
];

const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type TeamRow = {
  line: number;
  data: { name: string; cpf: string | null; email: string | null; phone: string | null; address: string | null; postal_code: string | null; sector: string | null; matricula: string | null; can_request: boolean; allowed_category_ids: string[] | null };
  categoryLabel: string;
  errors: string[];
  warnings: string[];
};

export function mapTeamHeaders(headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of TEAM_FIELDS) {
    const names = [f.label, ...f.aliases].map(norm);
    const idx = headers.findIndex((h, i) => !used.has(i) && names.includes(norm(h)));
    if (idx >= 0) {
      out[f.key] = idx;
      used.add(idx);
    }
  }
  return out;
}

/** "sim", "x", "1" → sim; "não", "nao", "0" → não; vazio → sim. */
export function parseYes(raw: string): boolean {
  const v = norm(raw);
  if (!v) return true;
  return !["nao", "n", "0", "false", "no", "sem acesso", "bloqueado"].includes(v);
}

/** Converte "Prime Essencial, Prime Executivo" (ou "todas") em ids das categorias. */
export function parseCategories(raw: string, categories: { id: string; name: string }[]): { ids: string[] | null; unknown: string[] } {
  const v = norm(raw);
  if (!v || ["todas", "todos", "qualquer", "qualquer uma", "livre", "todas as categorias"].includes(v)) return { ids: null, unknown: [] };
  const parts = String(raw).split(/[;,/|]+|\se\s/).map((p) => p.trim()).filter(Boolean);
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const n = norm(p);
    const hit = categories.find((c) => norm(c.name) === n) ?? categories.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
    if (hit) {
      if (!ids.includes(hit.id)) ids.push(hit.id);
    } else unknown.push(p);
  }
  return { ids: ids.length ? ids : null, unknown };
}

export function buildTeamRows(table: string[][], categories: { id: string; name: string }[], existing: { cpfs: Set<string>; emails: Set<string> }) {
  const [headers = [], ...body] = table;
  const mapping = mapTeamHeaders(headers.map(String));
  const rows: TeamRow[] = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    if (!cells.some((c) => String(c ?? "").trim())) return;
    const get = (k: string) => (mapping[k] === undefined ? "" : String(cells[mapping[k]] ?? "").trim());
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = get("name");
    if (name.length < 2) errors.push("sem nome");
    let cpf: string | null = onlyDigits(get("cpf")) || null;
    if (cpf && !validCpf(cpf)) {
      warnings.push("CPF parece errado (vai em branco)");
      cpf = null;
    }
    let email: string | null = get("email").toLowerCase() || null;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      warnings.push("e-mail inválido (vai em branco)");
      email = null;
    }
    const key = cpf ?? email ?? "";
    if (key && (seen.has(key) || (cpf && existing.cpfs.has(cpf)) || (email && existing.emails.has(email)))) warnings.push("já cadastrado (vai atualizar)");
    if (key) seen.add(key);
    const can_request = parseYes(get("can_request"));
    const cat = parseCategories(get("categories"), categories);
    if (cat.unknown.length) warnings.push(`categoria não encontrada: ${cat.unknown.join(", ")}`);
    if (can_request && !email) warnings.push("sem e-mail: cadastra, mas não recebe acesso ao portal");
    const label = cat.ids ? cat.ids.map((id) => categories.find((c) => c.id === id)?.name ?? "").join(", ") : "Todas";
    rows.push({
      line: i + 2,
      data: {
        name,
        cpf,
        email,
        phone: get("phone") || null,
        address: get("address") || null,
        postal_code: get("postal_code") || null,
        sector: get("sector") || null,
        matricula: get("matricula") || null,
        can_request,
        allowed_category_ids: cat.ids
      },
      categoryLabel: label,
      errors,
      warnings
    });
  });
  return { mapping, rows };
}

export function teamTemplateCsv(categoryNames: string[]): string {
  const head = TEAM_FIELDS.map((f) => f.label);
  const ex1 = ["Alan Souza", "529.982.247-25", "alan@empresa.com.br", "(27) 99999-0000", "Rua das Flores, 100 - Praia do Canto, Vitória/ES", "29055-000", "Diretoria", "1001", "sim", "todas"];
  const ex2 = ["Gustavo Lima", "", "gustavo@empresa.com.br", "(27) 98888-0000", "Av. Central, 50 - Serra/ES", "", "Operação", "1002", "sim", categoryNames[0] ?? "Prime Essencial"];
  return "﻿" + [head, ex1, ex2].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
}
