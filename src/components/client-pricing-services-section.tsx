"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PRIME_SERVICE_CATALOG,
  getPrimeServiceCatalogEntry,
  normalizePrimeServiceType,
  primeServiceTypeLabel
} from "@/lib/pricing/prime-service-catalog";
import type { PrimeChargeType } from "@/lib/pricing/prime-price-estimate";
import { primeMarginFromAmounts } from "@/lib/pricing/prime-price-estimate";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type RowState = {
  service_type: string;
  charge_type: PrimeChargeType;
  price_per_km: string;
  min_km: string;
  fixed_price: string;
  driver_price_per_km: string;
  driver_min_km: string;
  driver_fixed_price: string;
  enabled: boolean;
};

function emptyRow(serviceType: string): RowState {
  const cat = getPrimeServiceCatalogEntry(serviceType);
  const d = cat?.defaults ?? {};
  return {
    service_type: serviceType,
    charge_type: cat?.charge_type ?? "per_km",
    price_per_km: d.price_per_km != null ? String(d.price_per_km) : "",
    min_km: d.min_km != null ? String(d.min_km) : "20",
    fixed_price: d.fixed_price != null ? String(d.fixed_price) : "",
    driver_price_per_km: d.driver_price_per_km != null ? String(d.driver_price_per_km) : "",
    driver_min_km: d.driver_min_km != null ? String(d.driver_min_km) : "",
    driver_fixed_price: d.driver_fixed_price != null ? String(d.driver_fixed_price) : "",
    enabled: false
  };
}

function rowMargin(r: RowState): number {
  const cat = getPrimeServiceCatalogEntry(r.service_type);
  if (!cat) return 0;
  if (cat.charge_type === "per_km") {
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

export function ClientPricingServicesSection({ clientId, disabled }: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    PRIME_SERVICE_CATALOG.map((s) => emptyRow(s.id))
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const enabledRows = useMemo(() => rows.filter((r) => r.enabled), [rows]);

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
        active: boolean;
      }>;
    };

    const byType = new Map(
      (json.data ?? []).map((r) => [normalizePrimeServiceType(r.service_type), r])
    );

    setRows(
      PRIME_SERVICE_CATALOG.map((s) => {
        const base = emptyRow(s.id);
        const saved = byType.get(s.id);
        if (!saved || !saved.active) return base;
        return {
          service_type: s.id,
          charge_type: saved.charge_type,
          price_per_km: saved.price_per_km != null ? String(saved.price_per_km) : "",
          min_km: saved.min_km != null ? String(saved.min_km) : base.min_km,
          fixed_price: saved.fixed_price != null ? String(saved.fixed_price) : "",
          driver_price_per_km:
            saved.driver_price_per_km != null ? String(saved.driver_price_per_km) : "",
          driver_min_km:
            saved.driver_min_km != null ? String(saved.driver_min_km) : base.driver_min_km,
          driver_fixed_price:
            saved.driver_fixed_price != null ? String(saved.driver_fixed_price) : "",
          enabled: true
        };
      })
    );
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleEnabled(serviceType: string, enabled: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.service_type === serviceType ? { ...r, enabled } : r))
    );
  }

  function patchRow(serviceType: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.service_type === serviceType ? { ...r, ...patch } : r)));
  }

  async function onSave() {
    setBusy(true);
    setMessage(null);
    const payload = {
      rules: [
        ...enabledRows.map((r) => {
          const cat = getPrimeServiceCatalogEntry(r.service_type)!;
          const perKm = cat.charge_type === "per_km";
          return {
            service_type: r.service_type,
            charge_type: cat.charge_type,
            price_per_km: perKm ? Number(r.price_per_km) || 0 : null,
            min_km: Number(r.min_km) || null,
            fixed_price: perKm ? null : Number(r.fixed_price) || 0,
            driver_price_per_km: perKm ? Number(r.driver_price_per_km) || 0 : null,
            driver_min_km: perKm ? Number(r.driver_min_km) || Number(r.min_km) || null : null,
            driver_fixed_price: perKm ? null : Number(r.driver_fixed_price) || 0,
            active: true
          };
        }),
        ...rows
          .filter((r) => !r.enabled)
          .map((r) => ({
            service_type: r.service_type,
            charge_type: getPrimeServiceCatalogEntry(r.service_type)!.charge_type,
            active: false
          }))
      ]
    };

    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/pricing-rules`,
      { method: "PUT", body: JSON.stringify(payload) },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (res.ok && json.success) {
      setMessage({ kind: "success", text: "Serviços e valores guardados." });
      void load();
    } else {
      setMessage({ kind: "error", text: json.error?.message ?? "Falha ao guardar." });
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-prime-muted">A carregar serviços…</p>
      </section>
    );
  }

  return (
    <section className="card space-y-6">
      <div>
        <h3 className="text-base font-semibold text-prime-text">Serviços e preços</h3>
        <p className="mt-1 text-sm text-prime-muted">
          Passo 1 — habilite os serviços. Passo 2 — defina valores para cada serviço activo.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-prime-muted">
          Passo 1 — Habilitar serviços
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PRIME_SERVICE_CATALOG.map((s) => {
            const row = rows.find((r) => r.service_type === s.id)!;
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-prime-border bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={row.enabled}
                    disabled={disabled}
                    onChange={(e) => toggleEnabled(s.id, e.target.checked)}
                  />
                  <span>
                    <span className="font-medium text-prime-text">{s.label}</span>
                    <span className="mt-0.5 block text-xs text-prime-muted">{s.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {enabledRows.length > 0 ? (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-prime-muted">
            Passo 2 — Valores por serviço
          </p>
          <div className="space-y-4">
            {enabledRows.map((r) => {
              const cat = getPrimeServiceCatalogEntry(r.service_type)!;
              const perKm = cat.charge_type === "per_km";
              return (
                <div
                  key={r.service_type}
                  className="rounded-lg border border-prime-border bg-white p-4 shadow-prime-card"
                >
                  <h4 className="font-medium text-prime-text">{primeServiceTypeLabel(r.service_type)}</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {perKm ? (
                      <>
                        <label className="grid gap-1 text-sm">
                          <span>{cat.clientValueLabel}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={PRIME_INPUT_CLASS}
                            disabled={disabled}
                            value={r.price_per_km}
                            onChange={(e) => patchRow(r.service_type, { price_per_km: e.target.value })}
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span>{cat.driverValueLabel}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={PRIME_INPUT_CLASS}
                            disabled={disabled}
                            value={r.driver_price_per_km}
                            onChange={(e) =>
                              patchRow(r.service_type, { driver_price_per_km: e.target.value })
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="grid gap-1 text-sm">
                          <span>{cat.clientValueLabel}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={PRIME_INPUT_CLASS}
                            disabled={disabled}
                            value={r.fixed_price}
                            onChange={(e) => patchRow(r.service_type, { fixed_price: e.target.value })}
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span>{cat.driverValueLabel}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={PRIME_INPUT_CLASS}
                            disabled={disabled}
                            value={r.driver_fixed_price}
                            onChange={(e) =>
                              patchRow(r.service_type, { driver_fixed_price: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    {cat.showMinKm ? (
                      <label className="grid gap-1 text-sm">
                        <span>Km mínimo</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className={PRIME_INPUT_CLASS}
                          disabled={disabled}
                          value={r.min_km}
                          onChange={(e) => patchRow(r.service_type, { min_km: e.target.value })}
                        />
                      </label>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-prime-muted">
                    Margem de referência (km mín.): {fmtMoney(rowMargin(r))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-prime-muted">Nenhum serviço habilitado — marque ao menos um checkbox.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={disabled || busy} onClick={() => void onSave()}>
          {busy ? "A guardar…" : "Guardar serviços e valores"}
        </button>
        {message ? (
          <p className={`text-sm ${message.kind === "success" ? "text-green-800" : "text-red-700"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
