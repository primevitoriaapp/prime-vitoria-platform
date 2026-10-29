"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { FIELDS, buildRows, onlyDigits, parseCsv, templateCsv, type ImportKind, type RowResult } from "@/lib/import/sheet-import";

type Outcome = { line: number; ok: boolean; text: string };

declare global {
  interface Window {
    XLSX?: {
      read: (data: ArrayBuffer, opts: { type: "array"; cellDates?: boolean }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
      utils: { sheet_to_json: (sheet: unknown, opts: { header: 1; raw: boolean; defval: string }) => string[][] };
    };
  }
}

/** Carrega o leitor de Excel só quando precisa (do cdnjs). */
function loadXlsx(): Promise<NonNullable<Window["XLSX"]>> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.async = true;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("Leitor de Excel não carregou.")));
    s.onerror = () => reject(new Error("Não deu para carregar o leitor de Excel. Salve a planilha como CSV e tente de novo."));
    document.head.appendChild(s);
  });
}

async function readTable(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c ?? "")));
}

const KIND_LABEL: Record<ImportKind, string> = { clientes: "Clientes (empresas e pessoas)", motoristas: "Motoristas" };

/** Importar cadastros de clientes e motoristas a partir de uma planilha Excel ou CSV. */
export function SheetImportPanel() {
  const [kind, setKind] = useState<ImportKind>("clientes");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  function reset(k: ImportKind) {
    setKind(k);
    setRows([]);
    setFileName("");
    setOutcomes([]);
    setError(null);
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv(kind)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `modelo-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(file: File) {
    setError(null);
    setOutcomes([]);
    setFileName(file.name);
    try {
      const table = await readTable(file);
      if (table.length < 2) throw new Error("A planilha está vazia ou só tem o cabeçalho.");
      const existing = new Set<string>();
      const res = await fetchWithSupabaseSession(kind === "clientes" ? "/api/clients?include_inactive=1" : "/api/drivers?include_inactive=1", {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { document?: string | null; cpf?: string | null }[] };
      for (const r of json.data ?? []) {
        const d = onlyDigits((kind === "clientes" ? r.document : r.cpf) ?? "");
        if (d) existing.add(d);
      }
      const built = buildRows(kind, table, existing);
      setHeaders(table[0].map(String));
      setMapping(built.mapping);
      setRows(built.rows);
      const missing = FIELDS[kind].filter((f) => f.required && built.mapping[f.key] === undefined);
      if (missing.length) setError(`Não achei a coluna: ${missing.map((m) => m.label).join(", ")}. Confira o cabeçalho ou use o modelo.`);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
    }
  }

  const ready = rows.filter((r) => r.errors.length === 0 && !r.duplicate);

  async function runImport() {
    setBusy(true);
    setProgress(0);
    const out: Outcome[] = [];
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      const d = r.data;
      try {
        if (kind === "clientes") {
          const res = await fetchWithSupabaseSession(
            "/api/clients",
            {
              method: "POST",
              body: JSON.stringify({
                type: d.type,
                name: d.name,
                trade_name: d.trade_name || null,
                document: d.document || null,
                email: d.email || null,
                phone: d.phone || null,
                whatsapp: d.whatsapp || null,
                address_line: d.address_line || null,
                city: d.city || null,
                state: d.state || null,
                postal_code: d.postal_code || null,
                notes: d.notes || null
              })
            },
            "admin"
          );
          const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
          out.push({ line: r.line, ok: res.ok && Boolean(json.success), text: res.ok && json.success ? d.name : `${d.name}: ${json.error?.message ?? "erro"}` });
        } else {
          const res = await fetchWithSupabaseSession(
            "/api/drivers",
            { method: "POST", body: JSON.stringify({ full_name: d.full_name, cpf: d.cpf, cnh_number: d.cnh_number || undefined }) },
            "admin"
          );
          const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { id: string }; error?: { message?: string } };
          if (!res.ok || !json.success || !json.data?.id) {
            out.push({ line: r.line, ok: false, text: `${d.full_name}: ${json.error?.message ?? "erro"}` });
          } else {
            const extra: Record<string, unknown> = { employment_type: d.employment_type };
            if (d.whatsapp) extra.whatsapp = d.whatsapp;
            if (d.phone || d.whatsapp) extra.profile_phone = d.phone || d.whatsapp;
            if (d.email) extra.email = d.email;
            if (d.cnh_expiry) extra.cnh_expiry = d.cnh_expiry;
            if (d.pix_key) extra.pix_key = d.pix_key;
            const p = await fetchWithSupabaseSession(`/api/drivers/${json.data.id}`, { method: "PATCH", body: JSON.stringify(extra) }, "admin");
            out.push({ line: r.line, ok: true, text: p.ok ? d.full_name : `${d.full_name} (cadastrado; complete a ficha)` });
          }
        }
      } catch {
        out.push({ line: r.line, ok: false, text: `Linha ${r.line}: falha de conexão` });
      }
      setProgress(i + 1);
    }
    setOutcomes(out);
    setBusy(false);
  }

  const fields = FIELDS[kind];
  const okCount = outcomes.filter((o) => o.ok).length;

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-prime-border bg-white p-1 text-sm">
        {(Object.keys(KIND_LABEL) as ImportKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => reset(k)}
            className={`rounded-lg px-4 py-2 ${kind === k ? "bg-[#111] font-semibold text-[#fff]" : "text-prime-muted"}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <ol className="grid gap-3 md:grid-cols-3">
        <li className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs font-semibold text-prime-gold">PASSO 1</p>
          <p className="mt-1 font-semibold">Prepare a planilha</p>
          <p className="mt-1 text-sm text-prime-muted">
            Pode ser a sua, em Excel (.xlsx) ou CSV. A primeira linha precisa ter os nomes das colunas. Se preferir, baixe o modelo.
          </p>
          <button type="button" onClick={downloadTemplate} className="mt-3 text-sm font-semibold text-prime-gold hover:underline">
            Baixar modelo →
          </button>
        </li>
        <li className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs font-semibold text-prime-gold">PASSO 2</p>
          <p className="mt-1 font-semibold">Escolha o arquivo</p>
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-prime-border px-3 py-5 text-sm hover:border-prime-gold">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            {fileName || "Clique para escolher"}
          </label>
        </li>
        <li className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs font-semibold text-prime-gold">PASSO 3</p>
          <p className="mt-1 font-semibold">Confira e importe</p>
          <p className="mt-1 text-sm text-prime-muted">Nada é gravado antes de você clicar em importar. Quem já existe não é duplicado.</p>
          <button
            type="button"
            disabled={busy || ready.length === 0}
            onClick={() => void runImport()}
            className="btn-primary mt-3 disabled:opacity-40"
          >
            {busy ? `Importando ${progress}/${ready.length}…` : `Importar ${ready.length} cadastro(s)`}
          </button>
        </li>
      </ol>

      {error ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}

      {outcomes.length ? (
        <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="font-semibold">
            {okCount} importado(s){outcomes.length - okCount ? ` · ${outcomes.length - okCount} com erro` : ""}
          </p>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-sm">
            {outcomes.map((o) => (
              <li key={o.line} className={o.ok ? "text-emerald-800" : "text-red-700"}>
                {o.ok ? "✓" : "✗"} {o.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <b>{rows.length}</b> linha(s) na planilha
            </span>
            <span className="text-emerald-700">
              <b>{ready.length}</b> prontas
            </span>
            <span className="text-prime-muted">
              <b>{rows.filter((r) => r.duplicate).length}</b> já cadastradas (puladas)
            </span>
            <span className="text-red-700">
              <b>{rows.filter((r) => r.errors.length).length}</b> com erro (puladas)
            </span>
          </div>
          <p className="text-xs text-prime-muted">
            Colunas reconhecidas:{" "}
            {fields
              .filter((f) => mapping[f.key] !== undefined)
              .map((f) => `${headers[mapping[f.key]]} → ${f.label}`)
              .join(" · ") || "nenhuma"}
          </p>
          <div className="overflow-x-auto rounded-2xl border border-prime-border bg-white shadow-prime-card">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-prime-bg text-left text-xs uppercase text-prime-muted">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Situação</th>
                  {fields
                    .filter((f) => mapping[f.key] !== undefined)
                    .map((f) => (
                      <th key={f.key} className="px-3 py-2">
                        {f.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-prime-border">
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.line} className={r.errors.length ? "bg-red-50" : r.duplicate ? "bg-gray-50 text-prime-muted" : ""}>
                    <td className="px-3 py-1.5">{r.line}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length ? (
                        <span className="font-semibold text-red-700">{r.errors.join(", ")}</span>
                      ) : r.duplicate ? (
                        "Já existe"
                      ) : (
                        <span className="font-semibold text-emerald-700">Pronta</span>
                      )}
                      {r.warnings.length ? <span className="block text-amber-800">{r.warnings.join(", ")}</span> : null}
                    </td>
                    {fields
                      .filter((f) => mapping[f.key] !== undefined)
                      .map((f) => (
                        <td key={f.key} className="max-w-[200px] truncate px-3 py-1.5">
                          {f.key === "employment_type" ? (r.data[f.key] === "funcionario" ? "Funcionário" : "Parceiro") : r.data[f.key]}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
