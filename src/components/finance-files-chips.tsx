"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { FINANCE_FILE_KINDS, type FinanceEntityType, type FinanceFile, type FinanceFileKind } from "@/lib/finance/finance-files";

const SHORT: Record<string, string> = { boleto: "Boleto", comprovante: "Comprovante", nota: "Nota fiscal", outro: "Outro" };

/** Anexos de um lançamento (boleto, comprovante, nota fiscal): ver, anexar e apagar. */
export function FinanceFilesChips({
  entityType,
  entityId,
  files,
  onChange,
  suggest
}: {
  entityType: FinanceEntityType;
  entityId: string;
  files: FinanceFile[];
  onChange: () => void;
  /** Tipo sugerido no seletor (ex.: conta paga → comprovante). */
  suggest?: FinanceFileKind;
}) {
  const [kind, setKind] = useState<FinanceFileKind>(suggest ?? "boleto");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const has = (k: string) => files.some((f) => f.kind === k);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const u = await fetchWithSupabaseSession(
        "/api/finance/files/upload-url",
        { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_id: entityId, file_name: file.name, size: file.size }) },
        "admin"
      );
      const uj = (await u.json().catch(() => ({}))) as { success?: boolean; data?: { path: string; url: string }; error?: { message?: string } };
      if (!u.ok || !uj.success || !uj.data) throw new Error(uj.error?.message ?? "Falha ao preparar");
      const put = await fetch(uj.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" } });
      if (!put.ok) throw new Error("Falha no envio");
      const s = await fetchWithSupabaseSession(
        "/api/finance/files",
        { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_id: entityId, kind, path: uj.data.path, file_name: file.name, size: file.size, content_type: file.type || null }) },
        "admin"
      );
      if (!s.ok) throw new Error("Falha ao salvar");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: FinanceFile) {
    if (!window.confirm(`Apagar o anexo “${f.file_name}”?`)) return;
    await fetchWithSupabaseSession(`/api/finance/files/${f.id}`, { method: "DELETE" }, "admin");
    onChange();
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] no-underline" style={{ textDecoration: "none" }}>
      {files.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
          <a href={`/api/finance/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" title={f.file_name}>
            📎 {SHORT[f.kind] ?? f.kind}
          </a>
          <button type="button" onClick={() => void remove(f)} className="text-emerald-900/60 hover:text-red-700" aria-label="Apagar anexo">
            ×
          </button>
        </span>
      ))}
      {!has("boleto") && !has("comprovante") && !has("nota") ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">sem anexos</span> : null}
      <span className="inline-flex items-center gap-1 rounded-full px-1 ring-1 ring-prime-border">
        <select value={kind} onChange={(e) => setKind(e.target.value as FinanceFileKind)} className="bg-transparent py-0.5 text-[11px]" aria-label="Tipo do anexo">
          {Object.entries(FINANCE_FILE_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="cursor-pointer px-1 font-semibold text-prime-gold-ink">
          {busy ? "Enviando…" : "+ anexar"}
          <input
            type="file"
            className="hidden"
            accept="application/pdf,image/*,.xml,.ofx"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
      </span>
      {err ? <span className="text-red-700">{err}</span> : null}
    </div>
  );
}
