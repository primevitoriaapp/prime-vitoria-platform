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
  tagline: string;
  whatsapp: string;
  website: string;
  instagram: string;
  email_sender_name: string;
  email_reply_to: string;
  email_finance: string;
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
      setMessage(json.error?.message ?? "Falha ao salvar.");
      return;
    }

    setMessage(pendingLogo ? "✓ Dados e logo salvos. O menu e os próximos e-mails já usam os dados novos." : "✓ Dados salvos. O menu e os próximos e-mails já usam os dados novos.");
  }

  if (!form) {
    return <p className="text-sm text-prime-muted">Carregando…</p>;
  }

  const inputClass = PRIME_INPUT_CLASS;
  const previewSrc = logoPreviewUrl ?? (form.logo_storage_path ? "/api/tenant/company-profile/logo" : null);

  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const field = (k: keyof Profile, label: string, hint?: string, type = "text", placeholder?: string) => (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      {hint ? <span className="text-xs text-prime-muted">{hint}</span> : null}
      <input type={type} className={inputClass} value={String(form[k] ?? "")} placeholder={placeholder} onChange={set(k)} />
    </label>
  );
  const box = "grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card";

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid max-w-3xl gap-4">
      <section className={box}>
        <div>
          <h2 className="text-base font-semibold text-prime-text">1. Marca</h2>
          <p className="text-sm text-prime-muted">Aparece no menu do painel, no ícone do app e nas telas de entrada.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[#F6F3EC] ring-1 ring-prime-border">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-prime-muted">sem logo</span>
            )}
          </div>
          <div className="grid gap-1 text-sm">
            <label htmlFor="company-logo" className="font-semibold">Logo</label>
            <span className="text-xs text-prime-muted">PNG ou JPG quadrado, de preferência com fundo. Trocar aqui troca em todo o sistema.</span>
            <input
              id="company-logo"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
              disabled={busy}
              onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)}
            />
            {logoFile ? <span className="text-xs text-amber-800">Nova logo escolhida: {logoFile.name}. Clique em Salvar para aplicar.</span> : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("trade_name", "Nome da empresa", "Como os clientes conhecem a empresa.")}
          {field("tagline", "Frase embaixo do nome", "Ex.: Transporte executivo.")}
        </div>
      </section>

      <section className={box}>
        <div>
          <h2 className="text-base font-semibold text-prime-text">2. Dados da empresa</h2>
          <p className="text-sm text-prime-muted">Empresa principal. Os dados de cada CNPJ que emite fatura ficam em Financeiro → contas bancárias.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("legal_name", "Razão social")}
          {field("cnpj", "CNPJ")}
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Endereço</span>
          <textarea className={inputClass} rows={2} value={form.address_line} onChange={set("address_line")} />
        </label>
      </section>

      <section className={box}>
        <div>
          <h2 className="text-base font-semibold text-prime-text">3. Contatos</h2>
          <p className="text-sm text-prime-muted">Os contatos oficiais da empresa.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("phone", "Telefone fixo", undefined, "tel", "(27) 2142-8307")}
          {field("whatsapp", "WhatsApp", undefined, "tel", "(27) 99806-3956")}
          {field("email", "E-mail principal", undefined, "email")}
          {field("website", "Site", undefined, "url", "https://www.primevitoria.com")}
          {field("instagram", "Instagram", undefined, "text", "@primevitoria")}
        </div>
      </section>

      <section className={box}>
        <div>
          <h2 className="text-base font-semibold text-prime-text">4. E-mails do sistema</h2>
          <p className="text-sm text-prime-muted">Como os e-mails automáticos (faturas, orçamentos, avisos, acesso ao portal) chegam para os clientes.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("email_sender_name", "Nome do remetente", "É o nome que o cliente vê na caixa de entrada.")}
          {field("email_reply_to", "Respostas dos clientes vão para", "Quando o cliente responde um e-mail do sistema, cai aqui.", "email")}
          {field("email_finance", "E-mail do financeiro", "Recebe cópia das faturas enviadas e as respostas sobre cobrança.", "email")}
        </div>
        <p className="rounded-xl bg-[#F8F7F3] px-3 py-2 text-xs text-prime-muted">
          O endereço que <b>envia</b> (operacao@primevitoria.com) fica fixo: ele é o endereço autorizado no provedor de e-mail. Trocar por outro domínio precisa de configuração técnica.
        </p>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-prime-card ring-1 ring-prime-border">
        <button type="submit" disabled={busy} className="rounded-xl bg-[#111] px-5 py-2.5 text-sm font-bold text-prime-gold disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
        {message ? <p className={`text-sm font-semibold ${message.startsWith("✓") ? "text-emerald-700" : "text-red-700"}`}>{message}</p> : null}
      </div>
    </form>
  );
}
