"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { ARCHIVE_CATEGORIES, type ArchiveCategory } from "@/lib/archive/archive-categories";

type Row = { id: string; category: string; title: string; period: string | null; file_name: string; size_bytes: number | null; notes: string | null; created_at: string };

const size = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Arquivo de backups: histórico da Omie, notas, extratos antigos e contratos, guardados num lugar privado. */
export function ArchivePanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [category, setCategory] = useState<ArchiveCategory>("omie_receber");
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<string>("todas");

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/archive", {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
    if (j.success) setRows(j.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload() {
    if (!files.length) return setMsg({ ok: false, text: "Escolha um ou mais arquivos." });
    setMsg(null);
    let okCount = 0;
    const errors: string[] = [];
    for (const f of files) {
      setBusy(`Enviando ${f.name}…`);
      try {
        const u = await fetchWithSupabaseSession("/api/archive/upload-url", { method: "POST", body: JSON.stringify({ file_name: f.name, size: f.size, category }) }, "admin");
        const uj = (await u.json().catch(() => ({}))) as { success?: boolean; data?: { path: string; url: string }; error?: { message?: string } };
        if (!u.ok || !uj.success || !uj.data) throw new Error(uj.error?.message ?? "não foi possível preparar o envio");
        const put = await fetch(uj.data.url, { method: "PUT", body: f, headers: { "Content-Type": f.type || "application/octet-stream", "x-upsert": "false" } });
        if (!put.ok) throw new Error(`envio falhou (${put.status})`);
        const s = await fetchWithSupabaseSession(
          "/api/archive",
          {
            method: "POST",
            body: JSON.stringify({ path: uj.data.path, file_name: f.name, size: f.size, content_type: f.type || null, category, period: period || null, notes: notes || null })
          },
          "admin"
        );
        if (!s.ok) throw new Error("não foi possível registrar");
        okCount++;
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    setBusy(null);
    setFiles([]);
    setMsg(errors.length ? { ok: false, text: `${okCount} enviado(s). Falharam: ${errors.join(" · ")}` } : { ok: true, text: `${okCount} arquivo(s) guardado(s) em “${ARCHIVE_CATEGORIES[category]}”.` });
    await load();
  }

  async function remove(r: Row) {
    const c = window.prompt(`Apagar “${r.file_name}” para sempre? Digite APAGAR para confirmar.`);
    if (c !== "APAGAR") return;
    const res = await fetchWithSupabaseSession(`/api/archive/${r.id}?confirmar=APAGAR`, { method: "DELETE" }, "admin");
    if (res.ok) await load();
    else setMsg({ ok: false, text: "Não foi possível apagar (só o admin apaga)." });
  }

  const grouped = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) if (filter === "todas" || r.category === filter) g.set(r.category, [...(g.get(r.category) ?? []), r]);
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, filter]);
  const total = rows.reduce((s, r) => s + (r.size_bytes ?? 0), 0);

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border-2 border-prime-gold bg-white p-5 shadow-prime-card">
        <h2 className="text-lg font-semibold">Guardar arquivos</h2>
        <p className="text-sm text-prime-muted">Planilhas exportadas da Omie (Excel/CSV), PDFs, XMLs de nota, extratos antigos, contratos. Até 100 MB por arquivo. Só a equipe financeira vê.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Pasta</span>
            <select className={PRIME_INPUT_CLASS} value={category} onChange={(e) => setCategory(e.target.value as ArchiveCategory)}>
              {Object.entries(ARCHIVE_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Período (opcional)</span>
            <input className={PRIME_INPUT_CLASS} placeholder="Ex.: 2024, jan a dez/2025" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Observação (opcional)</span>
            <input className={PRIME_INPUT_CLASS} placeholder="Ex.: exportado da Omie em 06/11" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-sm" />
          <button type="button" disabled={Boolean(busy) || !files.length} onClick={() => void upload()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C] disabled:opacity-50">
            {busy ?? `Guardar ${files.length || ""} arquivo(s)`}
          </button>
        </div>
        {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
      </section>

      <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Arquivos guardados</h2>
            <p className="text-xs text-prime-muted">
              {rows.length} arquivo(s) · {size(total) || "0 KB"}
            </p>
          </div>
          <select className={`${PRIME_INPUT_CLASS} max-w-xs`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="todas">Todas as pastas</option>
            {Object.entries(ARCHIVE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {grouped.length === 0 ? <p className="mt-4 text-sm text-prime-muted">Nada guardado ainda.</p> : null}
        {grouped.map(([cat, list]) => (
          <div key={cat} className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-prime-gold-ink">{ARCHIVE_CATEGORIES[cat as ArchiveCategory] ?? cat}</p>
            <ul className="mt-1 divide-y divide-prime-border rounded-xl border border-prime-border">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.file_name}</span>
                    <span className="text-xs text-prime-muted">
                      {[r.period, size(r.size_bytes), `guardado em ${day(r.created_at)}`, r.notes].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex gap-3">
                    <a href={`/api/archive/${r.id}`} className="font-medium text-prime-gold-ink hover:underline">
                      ⬇ Baixar
                    </a>
                    <button type="button" onClick={() => void remove(r)} className="text-xs text-red-700 hover:underline">
                      apagar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
