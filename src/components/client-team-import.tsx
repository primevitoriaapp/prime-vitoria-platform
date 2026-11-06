"use client";

import { useState } from "react";
import { readTable } from "@/components/sheet-import-panel";
import { buildTeamRows, teamTemplateCsv, type TeamRow } from "@/lib/import/team-import";
import type { ClientPassengerRow } from "@/lib/clients/client-passengers";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_SURFACE_CARD } from "@/lib/ui/prime-surface-card";

type Cat = { id: string; name: string };

/** Gestor da empresa sobe uma planilha com todos os funcionários (endereço, quem pode pedir e quais carros). */
export function ClientTeamImport({
  clientId,
  categories,
  passengers,
  devFallbackRole,
  onDone
}: {
  clientId: string;
  categories: Cat[];
  passengers: ClientPassengerRow[];
  devFallbackRole: "cliente" | "admin";
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function downloadTemplate() {
    const blob = new Blob([teamTemplateCsv(categories.map((c) => c.name))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-funcionarios.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setFileName(file.name);
    try {
      const table = await readTable(file);
      const existing = {
        cpfs: new Set(passengers.map((p) => p.cpf).filter(Boolean) as string[]),
        emails: new Set(passengers.map((p) => p.email?.toLowerCase()).filter(Boolean) as string[])
      };
      const { mapping, rows: built } = buildTeamRows(table, categories, existing);
      if (mapping.name === undefined) {
        setRows([]);
        setMsg({ kind: "error", text: "Não achei a coluna “Nome” na planilha. Baixe o modelo e use os mesmos títulos." });
        return;
      }
      setRows(built);
      if (!built.length) setMsg({ kind: "error", text: "A planilha está vazia (só tem o título). Preencha uma linha por funcionário." });
    } catch (e) {
      setRows([]);
      setMsg({ kind: "error", text: e instanceof Error && e.message.includes("CSV") ? e.message : "Não consegui ler o arquivo. Use Excel (.xlsx) ou CSV." });
    }
  }

  async function runImport() {
    const valid = rows.filter((r) => r.errors.length === 0);
    if (!valid.length || busy) return;
    setBusy(true);
    setMsg(null);
    // Envia em blocos pequenos: planilha grande não estoura o tempo do servidor
    // e, se cair a internet no meio, o que já foi fica salvo (reenviar só atualiza).
    const CHUNK = 15;
    const total = { created: 0, updated: 0, invited: 0 };
    const errors: { name: string; message: string }[] = [];
    let stoppedAt: number | null = null;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const part = valid.slice(i, i + CHUNK);
      setProgress(`Importando ${Math.min(i + part.length, valid.length)} de ${valid.length}…`);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/clients/${clientId}/passengers/import`,
          { method: "POST", body: JSON.stringify({ rows: part.map((r) => r.data), invite }) },
          devFallbackRole
        );
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { created: number; updated: number; invited: number; errors: { name: string; message: string }[] };
          error?: { message?: string };
        };
        if (!res.ok || !json.success || !json.data) {
          errors.push({ name: `linhas ${part[0].line}–${part[part.length - 1].line}`, message: json.error?.message ?? `erro ${res.status}` });
          stoppedAt = i;
          break;
        }
        total.created += json.data.created;
        total.updated += json.data.updated;
        total.invited += json.data.invited;
        errors.push(...json.data.errors);
      } catch {
        errors.push({ name: `linhas ${part[0].line}–${part[part.length - 1].line}`, message: "sem conexão" });
        stoppedAt = i;
        break;
      }
    }
    setBusy(false);
    setProgress(null);
    const done = total.created + total.updated;
    setMsg({
      kind: stoppedAt === null && !errors.length ? "ok" : "error",
      text:
        `${stoppedAt === null ? "Pronto" : "Parou no meio"}: ${total.created} novo(s), ${total.updated} atualizado(s)` +
        (invite ? `, ${total.invited} convite(s) enviado(s)` : "") +
        "." +
        (errors.length ? ` Atenção: ${errors.map((e) => `${e.name} (${e.message})`).join("; ")}.` : "") +
        (stoppedAt !== null ? " Envie a mesma planilha de novo: quem já entrou só é atualizado, não duplica." : "")
    });
    if (stoppedAt === null) {
      setRows([]);
      setFileName("");
    }
    if (done) onDone();
  }

  const ok = rows.filter((r) => r.errors.length === 0).length;

  return (
    <div className={PRIME_SURFACE_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-prime-text">Importar planilha de funcionários</p>
          <p className="text-xs text-prime-muted">Cadastre todo mundo de uma vez, com endereço, quem pode pedir corrida e quais carros.</p>
        </div>
        <button type="button" className="btn-outline text-sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : "Importar planilha"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-prime-muted">
            <li>
              <button type="button" className="font-medium text-prime-gold-ink hover:underline" onClick={downloadTemplate}>
                Baixe o modelo
              </button>{" "}
              e preencha (abre no Excel).
            </li>
            <li>
              Em <b>Pode pedir corrida</b> escreva <b>sim</b> ou <b>não</b>. Em <b>Categorias permitidas</b> escreva <b>todas</b> ou os nomes separados por
              vírgula{categories.length ? ` (${categories.map((c) => c.name).join(", ")})` : ""}.
            </li>
            <li>Envie o arquivo, confira a prévia e confirme.</li>
          </ol>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-prime-border px-4 py-3">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <span className="text-prime-gold">Escolher arquivo</span>
            <span className="text-xs text-prime-muted">{fileName || "Excel ou CSV"}</span>
          </label>

          {rows.length ? (
            <>
              <div className="max-h-80 overflow-auto rounded-lg border border-prime-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-prime-bg text-left">
                    <tr>
                      <th className="p-2">Linha</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">E-mail</th>
                      <th className="p-2">Endereço</th>
                      <th className="p-2">Pede corrida</th>
                      <th className="p-2">Categorias</th>
                      <th className="p-2">Aviso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} className={`border-t border-prime-border ${r.errors.length ? "bg-red-50" : ""}`}>
                        <td className="p-2 text-prime-muted">{r.line}</td>
                        <td className="p-2">{r.data.name || "—"}</td>
                        <td className="p-2">{r.data.email ?? "—"}</td>
                        <td className="p-2">{r.data.address ?? "—"}</td>
                        <td className="p-2">{r.data.can_request ? "Sim" : "Não"}</td>
                        <td className="p-2">{r.data.can_request ? r.categoryLabel : "—"}</td>
                        <td className="p-2 text-amber-700">{[...r.errors, ...r.warnings].join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
                Enviar convite de acesso por e-mail para quem pode pedir corrida
              </label>
              <button type="button" className="btn-primary disabled:opacity-50" disabled={busy || !ok} onClick={() => void runImport()}>
                {busy ? (progress ?? "Importando…") : `Importar ${ok} funcionário(s)`}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {msg ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.kind === "ok" ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
