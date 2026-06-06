"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
  const [message, setMessage] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/tenant/company-profile", {}, "admin");
      const json = (await res.json()) as { success?: boolean; data?: Profile };
      if (res.ok && json.success && json.data) setForm(json.data);
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  function onLogoSelected(file: File | null) {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);

    if (!file) {
      setLogoFile(null);
      setLogoPreviewUrl(null);
      return;
    }

    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setMessage(null);
  }

  async function uploadLogo(file: File): Promise<boolean> {
    const body = new FormData();
    body.append("file", file, file.name);

    const res = await fetchWithSupabaseSession(
      "/api/tenant/company-profile/logo",
      { method: "POST", body },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha no upload do logo.");
      return false;
    }

    setForm((current) => (current ? { ...current, logo_storage_path: "uploaded" } : current));
    setLogoFile(null);
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;

    setBusy(true);
    setMessage(null);

    const pendingLogo = logoFile;
    if (pendingLogo) {
      const uploaded = await uploadLogo(pendingLogo);
      if (!uploaded) {
        setBusy(false);
        return;
      }
    }

    const res = await fetchWithSupabaseSession(
      "/api/tenant/company-profile",
      { method: "PATCH", body: JSON.stringify(form) },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);

    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao guardar.");
      return;
    }

    setMessage(pendingLogo ? "Dados e logo guardados." : "Dados guardados.");
  }

  if (!form) {
    return <p className="text-sm text-prime-muted">A carregar…</p>;
  }

  const inputClass = PRIME_INPUT_CLASS;
  const previewSrc = logoPreviewUrl ?? (form.logo_storage_path ? "/api/tenant/company-profile/logo" : null);

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="card max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-prime-text">Identidade visual</h2>
        <p className="mt-1 text-sm text-prime-muted">Aparece no cabeçalho e nos PDFs gerados.</p>
      </div>
      <div className="grid gap-1 text-sm">
        <label htmlFor="company-logo">Logo</label>
        <input
          id="company-logo"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
          disabled={busy}
          onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)}
        />
        {logoFile ? (
          <p className="text-xs text-prime-muted">
            Ficheiro seleccionado: <span className="text-prime-text">{logoFile.name}</span> — será enviado ao
            guardar.
          </p>
        ) : null}
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="Logo" className="mt-2 max-h-16 w-auto" />
        ) : null}
      </div>
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
