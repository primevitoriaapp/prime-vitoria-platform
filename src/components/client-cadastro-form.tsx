"use client";

import { FormEvent, useState } from "react";

export type ClientFormValues = {
  type: "PF" | "PJ";
  name: string;
  trade_name: string;
  document: string;
  email: string;
  phone: string;
  whatsapp: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
  registry_status: string;
  active: boolean;
};

const emptyForm = (): ClientFormValues => ({
  type: "PJ",
  name: "",
  trade_name: "",
  document: "",
  email: "",
  phone: "",
  whatsapp: "",
  address_line: "",
  city: "",
  state: "",
  postal_code: "",
  notes: "",
  registry_status: "",
  active: true
});

const inputClass = "rounded border border-slate-300 px-2 py-2 w-full";

type Props = {
  title: string;
  initial?: Partial<ClientFormValues>;
  clientId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function ClientCadastroForm({ title, initial, clientId, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<ClientFormValues>({ ...emptyForm(), ...initial });
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function lookupCnpj() {
    if (form.type !== "PJ") {
      setMessage("Consulta CNPJ disponível apenas para PJ.");
      return;
    }
    const digits = form.document.replace(/\D/g, "");
    if (digits.length !== 14) {
      setMessage("Informe um CNPJ válido (14 dígitos) no campo Documento.");
      return;
    }
    setLookupBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/integrations/cnpj-lookup?cnpj=${encodeURIComponent(digits)}`, {
        credentials: "include"
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          legal_name?: string | null;
          trade_name?: string | null;
          address_line?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          registry_status?: string | null;
          main_activity?: string | null;
          cnpj?: string;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setMessage(json.error?.message ?? "Não foi possível consultar o CNPJ. Preencha manualmente.");
        return;
      }
      const d = json.data;
      setForm((f) => ({
        ...f,
        document: d.cnpj ?? digits,
        name: d.legal_name ?? f.name,
        trade_name: d.trade_name ?? f.trade_name,
        address_line: d.address_line ?? f.address_line,
        city: d.city ?? f.city,
        state: d.state ?? f.state,
        postal_code: d.postal_code ?? f.postal_code,
        registry_status: d.registry_status ?? f.registry_status,
        notes: d.main_activity ? `CNAE: ${d.main_activity}` : f.notes
      }));
      setMessage("Dados do CNPJ preenchidos. Revise antes de guardar.");
    } catch {
      setMessage("Falha na consulta. Preencha manualmente.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        type: form.type,
        name: form.name.trim(),
        trade_name: form.trade_name.trim() || null,
        document: form.document.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        address_line: form.address_line.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        notes: form.notes.trim() || null,
        registry_status: form.registry_status.trim() || null,
        active: form.active
      };
      const url = clientId ? `/api/clients/${clientId}` : "/api/clients";
      const res = await fetch(url, {
        method: clientId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Falha ao guardar cliente");
      }
      setMessage(clientId ? "Cliente actualizado." : "Cliente registado.");
      if (!clientId) setForm(emptyForm());
      onSuccess?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const docLabel = form.type === "PJ" ? "CNPJ" : "CPF";

  return (
    <section className="card">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
        <label className="grid gap-1 text-sm">
          <span>Tipo</span>
          <select
            className={inputClass}
            value={form.type}
            onChange={(e) => set("type", e.target.value as "PF" | "PJ")}
          >
            <option value="PF">Pessoa física (PF)</option>
            <option value="PJ">Pessoa jurídica (PJ)</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{docLabel}</span>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={form.document}
              onChange={(e) => set("document", e.target.value)}
              placeholder={form.type === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"}
            />
            {form.type === "PJ" ? (
              <button
                type="button"
                disabled={lookupBusy}
                onClick={() => void lookupCnpj()}
                className="shrink-0 rounded-lg border border-amber-700 px-3 py-2 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
              >
                {lookupBusy ? "…" : "Consultar"}
              </button>
            ) : null}
          </div>
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>{form.type === "PJ" ? "Razão social" : "Nome completo"}</span>
          <input required className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        {form.type === "PJ" ? (
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Nome fantasia</span>
            <input className={inputClass} value={form.trade_name} onChange={(e) => set("trade_name", e.target.value)} />
          </label>
        ) : null}
        <label className="grid gap-1 text-sm">
          <span>E-mail</span>
          <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Telefone</span>
          <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>WhatsApp</span>
          <input className={inputClass} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>CEP</span>
          <input className={inputClass} value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Endereço</span>
          <input
            className={inputClass}
            value={form.address_line}
            onChange={(e) => set("address_line", e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Cidade</span>
          <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>UF</span>
          <input
            className={inputClass}
            maxLength={2}
            value={form.state}
            onChange={(e) => set("state", e.target.value.toUpperCase())}
          />
        </label>
        {form.type === "PJ" ? (
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Situação cadastral</span>
            <input
              className={inputClass}
              value={form.registry_status}
              onChange={(e) => set("registry_status", e.target.value)}
              readOnly={Boolean(form.registry_status)}
            />
          </label>
        ) : null}
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Observações</span>
          <textarea
            className={inputClass}
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          <span>Cliente activo</span>
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "A guardar…" : clientId ? "Actualizar cliente" : "Registar cliente"}
          </button>
          {onCancel ? (
            <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
      {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}

export function clientRowToForm(row: {
  type: string;
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  registry_status?: string | null;
  active?: boolean;
}): ClientFormValues {
  return {
    type: row.type === "PF" ? "PF" : "PJ",
    name: row.name,
    trade_name: row.trade_name ?? "",
    document: row.document ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    whatsapp: row.whatsapp ?? "",
    address_line: row.address_line ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postal_code: row.postal_code ?? "",
    notes: row.notes ?? "",
    registry_status: row.registry_status ?? "",
    active: row.active !== false
  };
}
