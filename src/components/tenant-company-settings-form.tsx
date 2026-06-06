"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Profile = {
  trade_name: string;
  legal_name: string;
  cnpj: string;
  address_line: string;
  phone: string;
  email: string;
  logo_storage_path: string | null;
};

export function TenantCompanySettingsForm() {
  const [form, setForm] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/tenant/company-profile", {}, "admin");
      const json = (await res.json()) as { success?: boolean; data?: Profile };
      if (res.ok && json.success && json.data) setForm(json.data);
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/tenant/company-profile",
      { method: "PATCH", body: JSON.stringify(form) },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    setMessage(res.ok && json.success ? "Dados guardados." : (json.error?.message ?? "Falha ao guardar."));
  }

  async function onLogo(file: File | null) {
    if (!file) return;
    setLogoBusy(true);
    const body = new FormData();
    body.set("file", file);
    const res = await fetchWithSupabaseSession(
      "/api/tenant/company-profile/logo",
      { method: "POST", body },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLogoBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha no upload do logo.");
      return;
    }
    setMessage("Logo actualizado.");
    setForm((f) => (f ? { ...f, logo_storage_path: "uploaded" } : f));
  }

  if (!form) {
    return <p className="text-sm text-prime-muted">A carregar…</p>;
  }

  const inputClass = PRIME_INPUT_CLASS;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="card max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-prime-text">Identidade visual</h2>
        <p className="mt-1 text-sm text-prime-muted">Aparece no cabeçalho e nos PDFs gerados.</p>
      </div>
      <label className="grid gap-1 text-sm">
        <span>Logo</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={logoBusy}
          onChange={(e) => {
            void onLogo(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {form.logo_storage_path ? (
          <img
            src="/api/tenant/company-profile/logo"
            alt="Logo"
            className="mt-2 max-h-16 w-auto"
          />
        ) : null}
      </label>
      <label className="grid gap-1 text-sm">
        <span>Nome fantasia</span>
        <input
          className={inputClass}
          value={form.trade_name}
          onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Razão social</span>
        <input
          className={inputClass}
          value={form.legal_name}
          onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>CNPJ</span>
        <input className={inputClass} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Endereço</span>
        <textarea
          className={inputClass}
          rows={2}
          value={form.address_line}
          onChange={(e) => setForm({ ...form, address_line: e.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Telefone</span>
        <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>
      <label className="grid gap-1 text-sm">
        <span>E-mail</span>
        <input
          type="email"
          className={inputClass}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </label>
      <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
        {busy ? "A guardar…" : "Guardar dados"}
      </button>
      {message ? <p className="text-sm text-prime-text">{message}</p> : null}
    </form>
  );
}
