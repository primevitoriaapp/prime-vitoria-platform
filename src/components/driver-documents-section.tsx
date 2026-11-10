"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { DRIVER_DOC_KINDS, type DriverDocKind } from "@/lib/drivers/driver-document-kinds";

type Doc = { id: string; kind: DriverDocKind; file_name: string | null; mime: string | null; size_bytes: number | null; valid_until: string | null; created_at: string; url: string | null };

const br = (ymd: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "");
const todayYmd = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Foto do celular fica com 3–8 MB; reduz para ~300 KB (lado maior 1600 px, JPEG). PDF vai como está. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // HEIC em navegador que não abre: vai o original
  }
}

/** Documentos e fotos do motorista/veículo, guardados em pasta privada. Sem <form> (fica fora/dentro de outros). */
export function DriverDocumentsSection({ driverId, vehicleId }: { driverId: string; vehicleId?: string | null }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<DriverDocKind | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [validity, setValidity] = useState<Partial<Record<DriverDocKind, string>>>({});

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/drivers/${driverId}/documents`, {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (j?.success) setDocs(j.data as Doc[]);
  }, [driverId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload(kind: DriverDocKind, original: File) {
    setBusy(kind);
    setMsg(null);
    try {
      const file = await shrink(original);
      const u = await fetchWithSupabaseSession(
        `/api/drivers/${driverId}/documents/upload-url`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, file_name: file.name, size: file.size }) },
        "admin"
      );
      const uj = await u.json().catch(() => ({}));
      if (!u.ok || !uj?.success) throw new Error(uj?.error?.message ?? "Falha ao preparar o envio.");
      const put = await fetch(uj.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" } });
      if (!put.ok) throw new Error("O arquivo não subiu. Confira a internet e tente de novo.");
      const r = await fetchWithSupabaseSession(
        `/api/drivers/${driverId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, path: uj.data.path, file_name: original.name, mime: file.type, size: file.size, valid_until: validity[kind] || null, vehicle_id: vehicleId ?? null })
        },
        "admin"
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error?.message ?? "Não foi possível salvar.");
      setMsg({ ok: true, text: `${DRIVER_DOC_KINDS.find((k) => k.kind === kind)?.label} salvo.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao enviar." });
    }
    setBusy(null);
  }

  async function saveValidity(doc: Doc, value: string) {
    await fetchWithSupabaseSession(`/api/drivers/${driverId}/documents/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valid_until: value || null }) }, "admin").catch(() => null);
    void load();
  }

  const byKind = new Map(docs.map((d) => [d.kind, d]));
  const required = DRIVER_DOC_KINDS.filter((k) => !k.optional);
  const done = required.filter((k) => byKind.has(k.kind)).length;

  const Slot = ({ k }: { k: (typeof DRIVER_DOC_KINDS)[number] }) => {
    const d = byKind.get(k.kind);
    const expired = d?.valid_until && d.valid_until < todayYmd();
    const isImg = d?.mime?.startsWith("image/");
    return (
      <div className={`grid gap-2 rounded-lg border p-3 text-sm ${d ? (expired ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50/40") : "border-slate-200 bg-white"}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">
            {d ? (expired ? "⛔ " : "✓ ") : "○ "}
            {k.label}
            {k.optional ? <span className="ml-1 text-xs font-normal text-slate-500">(opcional)</span> : null}
          </span>
          {d?.url ? (
            <a href={d.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-amber-800">
              Ver
            </a>
          ) : null}
        </div>
        {isImg && d?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.url} alt={k.label} className="h-28 w-full rounded-md object-cover" />
        ) : null}
        {d ? <p className="text-xs text-slate-500">Enviado em {br(d.created_at)}{d.valid_until ? ` · válido até ${br(d.valid_until)}` : ""}</p> : k.hint ? <p className="text-xs text-slate-500">{k.hint}</p> : null}
        {k.validity ? (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Validade
            <input
              type="date"
              className="rounded border border-slate-300 px-1.5 py-0.5"
              defaultValue={d?.valid_until ?? ""}
              onChange={(e) => (d ? void saveValidity(d, e.target.value) : setValidity((v) => ({ ...v, [k.kind]: e.target.value })))}
            />
          </label>
        ) : null}
        <label className={`cursor-pointer rounded-md border border-dashed px-3 py-2 text-center text-xs font-semibold ${busy === k.kind ? "opacity-50" : "border-slate-300 text-slate-700 hover:border-amber-600"}`}>
          {busy === k.kind ? "Enviando…" : d ? "Trocar arquivo" : k.group === "fotos" ? "📷 Tirar/escolher foto" : "⬆ Enviar arquivo"}
          <input
            type="file"
            className="hidden"
            accept={k.group === "fotos" ? "image/*" : "image/*,application/pdf"}
            capture={k.group === "fotos" ? "environment" : undefined}
            disabled={busy != null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(k.kind, f);
            }}
          />
        </label>
      </div>
    );
  };

  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4" onSubmit={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">📁 Documentos e fotos</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${done === required.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
          {done} de {required.length} obrigatórios
        </span>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pessoais</p>
        <div className="grid gap-2 sm:grid-cols-3">{DRIVER_DOC_KINDS.filter((k) => k.group === "pessoal").map((k) => <Slot key={k.kind} k={k} />)}</div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Veículo</p>
        <div className="grid gap-2 sm:grid-cols-3">{DRIVER_DOC_KINDS.filter((k) => k.group === "veiculo").map((k) => <Slot key={k.kind} k={k} />)}</div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fotos do veículo</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{DRIVER_DOC_KINDS.filter((k) => k.group === "fotos").map((k) => <Slot key={k.kind} k={k} />)}</div>
      </div>
      <p className="text-xs text-slate-500">Arquivos guardados em pasta privada: só a equipe da central vê, por link que expira em 10 minutos. Ao trocar um arquivo, o anterior fica no histórico.</p>
    </div>
  );
}
