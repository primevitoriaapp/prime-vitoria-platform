"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHARGE_TYPE_OPTIONS,
  emptyClientPricingConfig,
  type ClientChargeType,
  type ClientPricingConfigInput
} from "@/lib/clients/client-pricing-config";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

const inputClass = PRIME_INPUT_CLASS;

type Props = {
  clientId: string;
  disabled?: boolean;
  onSaved?: () => void;
};

export function ClientBillingConfigSection({ clientId, disabled, onSaved }: Props) {
  const [form, setForm] = useState<ClientPricingConfigInput>(emptyClientPricingConfig());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/pricing-config`, {}, "admin");
    const json = (await res.json()) as { success?: boolean; data?: ClientPricingConfigInput | null };
    if (res.ok && json.success && json.data) {
      setForm({
        service_type: json.data.service_type ?? "default",
        charge_type: (json.data.charge_type as ClientChargeType) ?? "per_km",
        price_per_km: json.data.price_per_km ?? 4.5,
        min_km: json.data.min_km ?? 20,
        wait_tolerance_minutes: json.data.wait_tolerance_minutes ?? 10,
        wait_price_per_hour: json.data.wait_price_per_hour ?? 80,
        fixed_price: json.data.fixed_price ?? null
      });
    } else {
      setForm(emptyClientPricingConfig());
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/pricing-config`,
      { method: "PUT", body: JSON.stringify(form) },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string; hint?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage({
        kind: "error",
        text: [json.error?.message, json.error?.hint].filter(Boolean).join(" — ") || "Falha ao guardar cobrança."
      });
      return;
    }
    setMessage({ kind: "success", text: "Configuração de cobrança guardada." });
    onSaved?.();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">A carregar configuração de cobrança…</p>;
  }

  return (
    <fieldset className="grid gap-3 md:col-span-2" disabled={disabled || busy}>
      <legend className="mb-1 text-sm font-semibold text-slate-800">Configuração de cobrança</legend>
      <p className="text-xs text-slate-600 md:col-span-2">
        Valores usados pelo motor de precificação ao finalizar corridas deste cliente.
      </p>
      <label className="grid gap-1 text-sm">
        <span>Tipo de cobrança padrão</span>
        <select
          className={inputClass}
          value={form.charge_type}
          onChange={(e) => setForm((f) => ({ ...f, charge_type: e.target.value as ClientChargeType }))}
        >
          {CHARGE_TYPE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {form.charge_type === "per_km" ? (
        <>
          <label className="grid gap-1 text-sm">
            <span>Valor por km cobrado ao cliente (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={form.price_per_km ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, price_per_km: Number(e.target.value) }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Km mínimo</span>
            <input
              type="number"
              min="0"
              step="0.1"
              className={inputClass}
              value={form.min_km ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, min_km: Number(e.target.value) }))}
            />
          </label>
        </>
      ) : (
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>
            {form.charge_type === "daily"
              ? "Valor da diária (R$)"
              : form.charge_type === "hourly"
                ? "Valor por hora (R$)"
                : "Valor fixo (R$)"}
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={form.fixed_price ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, fixed_price: Number(e.target.value) }))}
          />
        </label>
      )}
      <label className="grid gap-1 text-sm">
        <span>Tolerância de espera grátis (minutos)</span>
        <input
          type="number"
          min="0"
          step="1"
          className={inputClass}
          value={form.wait_tolerance_minutes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, wait_tolerance_minutes: Number(e.target.value) }))}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Valor por hora de espera após tolerância (R$)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className={inputClass}
          value={form.wait_price_per_hour ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, wait_price_per_hour: Number(e.target.value) }))}
        />
      </label>
      <div className="md:col-span-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
        >
          {busy ? "A guardar…" : "Guardar configuração de cobrança"}
        </button>
      </div>
      {message ? (
        <p
          className={`md:col-span-2 text-sm ${message.kind === "success" ? "text-emerald-800" : "text-red-800"}`}
          role="alert"
        >
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
