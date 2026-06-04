"use client";

import { FormEvent, useState } from "react";
import { isValidCnpj } from "@/lib/integrations/cnpj-public-lookup";
import { ClientPricingServicesSection } from "@/components/client-pricing-services-section";
import { CLIENT_SERVICE_TYPE_OPTIONS, type ClientServiceTypeId } from "@/lib/clients/client-service-types";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

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
  service_types: ClientServiceTypeId[];
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
  active: true,
  service_types: []
});

const inputClass = PRIME_INPUT_CLASS;

type FormFeedback = {
  kind: "success" | "error" | "info";
  message: string;
  code?: string;
  hint?: string;
};

async function parseApiResponse(res: Response): Promise<{
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; hint?: string };
}> {
  const text = await res.text();
  if (!text.trim()) {
    return { ok: false, error: { code: `HTTP_${res.status}`, message: `Resposta vazia do servidor (HTTP ${res.status}).` } };
  }
  try {
    const parsed = JSON.parse(text) as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string; hint?: string };
    };
    return {
      ok: parsed.success === true,
      data: parsed.data,
      error: parsed.error
    };
  } catch {
    return {
      ok: false,
      error: {
        code: `HTTP_${res.status}`,
        message:
          res.status === 401
            ? "Sessão expirada ou preview bloqueado. Inicie sessão novamente."
            : `Resposta inválida do servidor (HTTP ${res.status}). Verifique se está no ambiente P1.`
      }
    };
  }
}

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
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleServiceType(id: ClientServiceTypeId) {
    setForm((f) => {
      const has = f.service_types.includes(id);
      return {
        ...f,
        service_types: has ? f.service_types.filter((s) => s !== id) : [...f.service_types, id]
      };
    });
  }

  async function lookupCnpj() {
    if (form.type !== "PJ") {
      setFeedback({ kind: "info", message: "Consulta CNPJ disponível apenas para PJ." });
      return;
    }
    const digits = form.document.replace(/\D/g, "");
    if (digits.length !== 14) {
      setFeedback({ kind: "error", message: "Informe um CNPJ com 14 dígitos." });
      return;
    }
    if (!isValidCnpj(digits)) {
      setFeedback({
        kind: "error",
        code: "CNPJ_INVALID",
        message: "CNPJ inválido — verifique os dígitos verificadores.",
        hint: "Ex.: Comexport é 43.633.296/0001-90. Corrija o número ou preencha manualmente."
      });
      return;
    }
    setLookupBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/integrations/cnpj-lookup?cnpj=${encodeURIComponent(digits)}`, {
        credentials: "include"
      });
      const json = await parseApiResponse(res);
      if (!res.ok || !json.ok) {
        setFeedback({
          kind: "error",
          code: json.error?.code ?? `HTTP_${res.status}`,
          message: json.error?.message ?? "Não foi possível consultar o CNPJ.",
          hint: json.error?.hint ?? "Preencha razão social e endereço manualmente."
        });
        return;
      }
      const d = json.data as {
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
      if (!d?.legal_name && !d?.trade_name) {
        setFeedback({
          kind: "error",
          code: "CNPJ_NOT_FOUND",
          message: "Consulta não devolveu razão social. Preencha manualmente."
        });
        return;
      }
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
      setFeedback({
        kind: "success",
        message: `Dados de «${d.legal_name ?? d.trade_name}» preenchidos. Revise antes de guardar.`
      });
    } catch {
      setFeedback({
        kind: "error",
        message: "Falha na consulta CNPJ (rede ou timeout). Preencha manualmente."
      });
    } finally {
      setLookupBusy(false);
    }
  }

  function validateBeforeSave(): string | null {
    if (!form.name.trim()) {
      return form.type === "PJ" ? "Informe a razão social." : "Informe o nome completo.";
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "E-mail inválido — corrija ou deixe em branco.";
    }
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validateBeforeSave();
    if (validationError) {
      setFeedback({ kind: "error", message: validationError });
      return;
    }
    setBusy(true);
    setFeedback(null);
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
        active: form.active,
        ...(form.type === "PJ" ? { service_types: form.service_types } : {})
      };
      const url = clientId ? `/api/clients/${clientId}` : "/api/clients";
      const res = await fetchWithSupabaseSession(
        url,
        {
          method: clientId ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        },
        "admin"
      );
      const json = await parseApiResponse(res);
      if (!res.ok || !json.ok) {
        setFeedback({
          kind: "error",
          code: json.error?.code ?? `HTTP_${res.status}`,
          message: json.error?.message ?? "Falha ao guardar cliente.",
          hint: json.error?.hint
        });
        return;
      }

      const saved = json.data as { _warning?: string } | undefined;
      const successMsg = clientId
        ? "Cliente actualizado com sucesso."
        : form.type === "PJ"
          ? "Cliente cadastrado com sucesso."
          : "Cliente registado com sucesso.";
      setFeedback({
        kind: saved?._warning ? "info" : "success",
        message: saved?._warning ? `${successMsg} ${saved._warning}` : successMsg
      });
      if (!clientId) setForm(emptyForm());
      onSuccess?.();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao guardar."
      });
    } finally {
      setBusy(false);
    }
  }

  const docLabel = form.type === "PJ" ? "CNPJ" : "CPF";

  return (
    <section className="card">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <form className="mt-4 grid gap-3 md:grid-cols-2" noValidate onSubmit={(e) => void onSubmit(e)}>
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
          {form.type === "PJ" ? (
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={form.document}
                onChange={(e) => set("document", e.target.value)}
                placeholder="00.000.000/0000-00"
              />
              <button
                type="button"
                disabled={lookupBusy}
                onClick={() => void lookupCnpj()}
                className="shrink-0 rounded-lg border border-amber-700 px-3 py-2 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
              >
                {lookupBusy ? "…" : "Consultar"}
              </button>
            </div>
          ) : (
            <input
              className={inputClass}
              value={form.document}
              onChange={(e) => set("document", e.target.value)}
              placeholder="000.000.000-00"
            />
          )}
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
        {form.type === "PJ" ? (
          <fieldset className="grid gap-2 md:col-span-2">
            <legend className="text-sm font-medium text-slate-800">Tipos de serviço utilizados</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CLIENT_SERVICE_TYPE_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.service_types.includes(opt.id)}
                    onChange={() => toggleServiceType(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className="grid gap-1 text-sm">
          <span>E-mail</span>
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
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
        {clientId && form.type === "PJ" ? (
          <ClientPricingServicesSection clientId={clientId} disabled={busy} />
        ) : null}
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
      {feedback ? (
        <div
          role="alert"
          className={`mt-3 rounded-lg border px-3 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-red-300 bg-red-50 text-red-950"
              : feedback.kind === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          {feedback.code ? (
            <p className="mb-1 font-mono text-xs opacity-80">Código: {feedback.code}</p>
          ) : null}
          <p className="font-medium">{feedback.message}</p>
          {feedback.hint ? <p className="mt-2 text-xs opacity-90">{feedback.hint}</p> : null}
        </div>
      ) : null}
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
  service_types?: string[] | null;
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
    active: row.active !== false,
    service_types: (row.service_types ?? []).filter((id): id is ClientServiceTypeId =>
      CLIENT_SERVICE_TYPE_OPTIONS.some((o) => o.id === id)
    )
  };
}
