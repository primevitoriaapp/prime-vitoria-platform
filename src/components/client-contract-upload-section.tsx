"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Props = {
  clientId: string;
  disabled?: boolean;
};

export function ClientContractUploadSection({ clientId, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onUpload(file: File | null) {
    if (!file || disabled) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/contract/upload`,
      { method: "POST", body: form },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha no upload do contrato.");
      return;
    }
    setMessage("Contrato guardado. O cliente pode abrir em «Ver contrato» no portal.");
  }

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
      <p className="text-sm font-medium text-slate-900">Contrato (PDF)</p>
      <p className="text-xs text-slate-600">
        Envie o contrato assinado. Fica disponível no portal corporativo do cliente.
      </p>
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy || disabled}
        className="text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void onUpload(f);
          e.target.value = "";
        }}
      />
      {busy ? <p className="text-xs text-slate-500">A enviar PDF…</p> : null}
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </div>
  );
}
