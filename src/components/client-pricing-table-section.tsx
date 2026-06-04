"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { primeMarginFromAmounts, type PrimeChargeType } from "@/lib/pricing/prime-price-estimate";
import { PRIME_SERVICE_TYPES, primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

const CHARGE_OPTIONS: { id: PrimeChargeType; label: string }[] = [
  { id: "per_km", label: "Por km (R$/km)" },
  { id: "fixed", label: "Valor fixo (R$)" },
  { id: "daily", label: "Diária (R$)" }
];

type RowState = {
  service_type: string;
  charge_type: PrimeChargeType;
  price_per_km: string;
  min_km: string;
  fixed_price: string;
  driver_price_per_km: string;
  driver_min_km: string;
  driver_fixed_price: string;
};

function emptyRow(serviceType: string): RowState {
  return {
    service_type: serviceType,
    charge_type: "per_km",
    price_per_km: "",
    min_km: "20",
    fixed_price: "",
    driver_price_per_km: "",
    driver_min_km: "20",
    driver_fixed_price: ""
  };
}

function rowMargin(r: RowState): number {
  if (r.charge_type === "per_km") {
    const km = Number(r.min_km) || 0;
    const client = km * (Number(r.price_per_km) || 0);
    const driver = km * (Number(r.driver_price_per_km) || 0);
    return primeMarginFromAmounts(client, driver);
  }
  return primeMarginFromAmounts(Number(r.fixed_price) || 0, Number(r.driver_fixed_price) || 0);
}

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  clientId: string;
  disabled?: boolean;
};

export function ClientPricingTableSection({ clientId, disabled }: Props) {
  const [rows, setRows] = useState<RowState[]>(() => PRIME_SERVICE_TYPES.map((s) => emptyRow(s.id)));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/pricing-rules`, {}, "admin");
    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<{
        service_type: string;
        charge_type: PrimeChargeType;
        price_per_km: number | null;
        min_km: number | null;
        fixed_price: number | null;
        driver_price_per_km: number | null;
        driver_min_km: number | null;
        driver_fixed_price: number | null;
      }>;
    };

    const byType = new Map((json.data ?? []).map((r) => [r.service_type, r]));
    setRows(
      PRIME_SERVICE_TYPES.map((s) => {
        const saved = byType.get(s.id);
        if (!saved) return emptyRow(s.id);
        return {
          service_type: s.id,
          charge_type: saved.charge_type,
          price_per_km: saved.price_per_km != null ? String(saved.price_per_km) : "",
          min_km: saved.min_km != null ? String(saved.min_km) : "",
          fixed_price: saved.fixed_price != null ? String(saved.fixed_price) : "",
          driver_price_per_km:
            saved.driver_price_per_km != null ? String(saved.driver_price_per_km) : "",
          driver_min_km: saved.driver_min_km != null ? String(saved.driver_min_km) : "",
          driver_fixed_price:
            saved.driver_fixed_price != null ? String(saved.driver_fixed_price) : ""
        };
      })
    );
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAnyValue = useMemo(
    () =>
      rows.some(
        (r) =>
          r.price_per_km ||
          r.fixed_price ||
          r.driver_price_per_km ||
          r.driver_fixed_price
      ),
    [rows]
  );

  function patchRow(serviceType: string, patch: Partial<RowState>) {
    setRows((list) => list.map((r) => (r.service_type === serviceType ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const payload = rows
      .filter(
        (r) =>
          r.price_per_km ||
          r.fixed_price ||
          r.driver_price_per_km ||
          r.driver_fixed_price
      )
      .map((r) => ({
        service_type: r.service_type,
        charge_type: r.charge_type,
        price_per_km: r.price_per_km ? Number(r.price_per_km) : null,
        min_km: r.min_km ? Number(r.min_km) : null,
        fixed_price: r.fixed_price ? Number(r.fixed_price) : null,
        driver_price_per_km: r.driver_price_per_km ? Number(r.driver_price_per_km) : null,
        driver_min_km: r.driver_min_km ? Number(r.driver_min_km) : null,
        driver_fixed_price: r.driver_fixed_price ? Number(r.driver_fixed_price) : null,
        active: true
      }));

    if (payload.length === 0) {
      setMessage({ kind: "error", text: "Preencha pelo menos uma linha da tabela." });
      setBusy(false);
      return;
    }

    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/pricing-rules`,
      { method: "PUT", body: JSON.stringify({ rules: payload }) },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string; hint?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage({
        kind: "error",
        text: [json.error?.message, json.error?.hint].filter(Boolean).join(" — ") || "Falha ao guardar."
      });
      return;
    }
    setMessage({ kind: "success", text: "Tabela de preços guardada." });
    void load();
  }

  if (loading) {
    return <p className="text-sm text-prime-muted">A carregar tabela de preços…</p>;
  }

  return (
    <fieldset className="md:col-span-2" disabled={disabled || busy}>
      <legend className="mb-2 text-sm font-semibold text-prime-text">Tabela de preços</legend>
      <p className="mb-3 text-xs text-prime-muted">
        Preço cobrado ao cliente e repasse ao motorista por tipo de serviço. A margem é calculada automaticamente
        (referência: km mínimo para cobrança por km).
      </p>
      <div className="overflow-x-auto rounded-prime-card border border-prime-border bg-prime-card shadow-prime-card">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-prime-border text-xs uppercase tracking-wide text-prime-muted">
              <th className="px-2 py-2">Tipo de serviço</th>
              <th className="px-2 py-2">Cobrança</th>
              <th className="px-2 py-2">Valor cliente</th>
              <th className="px-2 py-2">Km mín.</th>
              <th className="px-2 py-2">Valor motorista</th>
              <th className="px-2 py-2">Margem (ref.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const margin = rowMargin(r);
              const perKm = r.charge_type === "per_km";
              return (
                <tr key={r.service_type} className="border-b border-prime-border/80">
                  <td className="px-2 py-2 font-medium text-prime-text">
                    {primeServiceTypeLabel(r.service_type)}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className={PRIME_INPUT_CLASS}
                      value={r.charge_type}
                      onChange={(e) =>
                        patchRow(r.service_type, { charge_type: e.target.value as PrimeChargeType })
                      }
                    >
                      {CHARGE_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {perKm ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="R$/km"
                        className={PRIME_INPUT_CLASS}
                        value={r.price_per_km}
                        onChange={(e) => patchRow(r.service_type, { price_per_km: e.target.value })}
                      />
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="R$"
                        className={PRIME_INPUT_CLASS}
                        value={r.fixed_price}
                        onChange={(e) => patchRow(r.service_type, { fixed_price: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {perKm ? (
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className={PRIME_INPUT_CLASS}
                        value={r.min_km}
                        onChange={(e) => patchRow(r.service_type, { min_km: e.target.value })}
                      />
                    ) : (
                      <span className="text-prime-muted">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {perKm ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="R$/km"
                        className={PRIME_INPUT_CLASS}
                        value={r.driver_price_per_km}
                        onChange={(e) => patchRow(r.service_type, { driver_price_per_km: e.target.value })}
                      />
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="R$"
                        className={PRIME_INPUT_CLASS}
                        value={r.driver_fixed_price}
                        onChange={(e) => patchRow(r.service_type, { driver_fixed_price: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 font-medium text-prime-gold">{fmtMoney(margin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy || !hasAnyValue} onClick={() => void save()}>
          {busy ? "A guardar…" : "Guardar tabela de preços"}
        </button>
      </div>
      {message ? (
        <p
          className={`mt-2 text-sm ${message.kind === "success" ? "text-prime-green" : "text-prime-red"}`}
          role="alert"
        >
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
