"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CORPORATIVO_PRICING_KEYS,
  CORPORATIVO_UI_ENTRY,
  PRIME_SERVICE_CATALOG_UI,
  getPrimeServiceCatalogEntry,
  getPrimeServiceCatalogPricingEntry,
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
  const cat = getPrimeServiceCatalogPricingEntry(serviceType) ?? getPrimeServiceCatalogEntry(serviceType);
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
  const cat = getPrimeServiceCatalogPricingEntry(r.service_type);
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

function rulePayload(r: RowState) {
  const cat = getPrimeServiceCatalogPricingEntry(r.service_type)!;
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
}

type Props = {
  clientId: string;
  disabled?: boolean;
};

export function ClientPricingServicesSection({ clientId, disabled }: Props) {
  const [uiRows, setUiRows] = useState<RowState[]>(() =>
    PRIME_SERVICE_CATALOG_UI.map((s) => emptyRow(s.id))
  );
  const [bandeiraRows, setBandeiraRows] = useState<Record<string, RowState>>(() => ({
    corporativo_b1: emptyRow("corporativo_b1"),
    corporativo_b2: emptyRow("corporativo_b2")
  }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const corporativoEnabled = uiRows.find((r) => r.service_type === "corporativo")?.enabled ?? false;
  const enabledUiRows = useMemo(
    () => uiRows.filter((r) => r.enabled && r.service_type !== "corporativo"),
    [uiRows]
  );

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

    setUiRows(
      PRIME_SERVICE_CATALOG_UI.map((s) => {
        const base = emptyRow(s.id);
        if (s.id === "corporativo") {
          const b1 = byType.get("corporativo_b1");
          const b2 = byType.get("corporativo_b2");
          return { ...base, enabled: Boolean(b1?.active || b2?.active) };
        }
        const saved = byType.get(s.id);
        if (!saved?.active) return base;
        return {
          ...base,
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

    setBandeiraRows(
      Object.fromEntries(
        CORPORATIVO_PRICING_KEYS.map((key) => {
          const base = emptyRow(key);
          const saved = byType.get(key);
          if (!saved?.active) return [key, base];
          return [
            key,
            {
              ...base,
              charge_type: saved.charge_type,
              price_per_km: saved.price_per_km != null ? String(saved.price_per_km) : "",
              min_km: saved.min_km != null ? String(saved.min_km) : base.min_km,
              driver_price_per_km:
                saved.driver_price_per_km != null ? String(saved.driver_price_per_km) : "",
              driver_min_km:
                saved.driver_min_km != null ? String(saved.driver_min_km) : base.driver_min_km,
              driver_fixed_price:
                saved.driver_fixed_price != null ? String(saved.driver_fixed_price) : "",
              enabled: true
            }
          ];
        })
      )
    );
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleUiEnabled(serviceType: string, enabled: boolean) {
    setUiRows((prev) =>
      prev.map((r) => (r.service_type === serviceType ? { ...r, enabled } : r))
    );
  }

  function patchUiRow(serviceType: string, patch: Partial<RowState>) {
    setUiRows((prev) => prev.map((r) => (r.service_type === serviceType ? { ...r, ...patch } : r)));
  }

  function patchBandeira(key: string, patch: Partial<RowState>) {
    setBandeiraRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function renderPriceFields(r: RowState, onPatch: (p: Partial<RowState>) => void, title: string) {
    const cat = getPrimeServiceCatalogPricingEntry(r.service_type)!;
    const perKm = cat.charge_type === "per_km";
    return (
      <div className="rounded-lg border border-prime-border bg-white p-4 shadow-prime-card">
        <h4 className="font-medium text-prime-text">{title}</h4>
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
                  onChange={(e) => onPatch({ price_per_km: e.target.value })}
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
                  onChange={(e) => onPatch({ driver_price_per_km: e.target.value })}
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
                  onChange={(e) => onPatch({ fixed_price: e.target.value })}
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
                  onChange={(e) => onPatch({ driver_fixed_price: e.target.value })}
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
                onChange={(e) => onPatch({ min_km: e.target.value })}
              />
            </label>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-prime-muted">
          Margem de referência (km mín.): {fmtMoney(rowMargin(r))}
        </p>
      </div>
    );
  }

  async function onSave() {
    setBusy(true);
    setMessage(null);

    const activeRules = [
      ...enabledUiRows.map(rulePayload),
      ...(corporativoEnabled
        ? CORPORATIVO_PRICING_KEYS.map((k) => rulePayload({ ...bandeiraRows[k], enabled: true }))
        : [])
    ];

    const inactiveRules = [
      ...uiRows
        .filter((r) => !r.enabled && r.service_type !== "corporativo")
        .map((r) => ({
          service_type: r.service_type,
          charge_type: getPrimeServiceCatalogEntry(r.service_type)!.charge_type,
          active: false
        })),
      ...(!corporativoEnabled
        ? CORPORATIVO_PRICING_KEYS.map((k) => ({
            service_type: k,
            charge_type: "per_km" as PrimeChargeType,
            active: false
          }))
        : [])
    ];

    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/pricing-rules`,
      { method: "PUT", body: JSON.stringify({ rules: [...activeRules, ...inactiveRules] }) },
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

  const hasEnabled = corporativoEnabled || enabledUiRows.length > 0;

  return (
    <section className="card space-y-6">
      <div>
        <h3 className="text-base font-semibold text-prime-text">Serviços e preços</h3>
        <p className="mt-1 text-sm text-prime-muted">
          Passo 1 — habilite os serviços. Passo 2 — valores (Corporativo: bandeira 1 e 2 para o operador;
          no portal aplica-se automaticamente pelo horário).
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-prime-muted">
          Passo 1 — Habilitar serviços
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PRIME_SERVICE_CATALOG_UI.map((s) => {
            const row = uiRows.find((r) => r.service_type === s.id)!;
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-prime-border bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={row.enabled}
                    disabled={disabled}
                    onChange={(e) => toggleUiEnabled(s.id, e.target.checked)}
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

      {hasEnabled ? (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-prime-muted">
            Passo 2 — Valores por serviço
          </p>
          <div className="space-y-4">
            {enabledUiRows.map((r) =>
              renderPriceFields(r, (p) => patchUiRow(r.service_type, p), primeServiceTypeLabel(r.service_type))
            )}
            {corporativoEnabled ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-prime-text">{CORPORATIVO_UI_ENTRY.label}</p>
                {CORPORATIVO_PRICING_KEYS.map((key) =>
                  renderPriceFields(
                    bandeiraRows[key],
                    (p) => patchBandeira(key, p),
                    getPrimeServiceCatalogPricingEntry(key)!.label
                  )
                )}
              </div>
            ) : null}
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
