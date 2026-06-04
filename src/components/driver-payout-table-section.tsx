"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrimeChargeType } from "@/lib/pricing/prime-price-estimate";
import {
  PRIME_SERVICE_TYPES,
  normalizePrimeServiceType,
  primeServiceTypeLabel
} from "@/lib/pricing/prime-service-types";
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
};

function emptyRow(serviceType: string): RowState {
  return {
    service_type: serviceType,
    charge_type: "per_km",
    price_per_km: "",
    min_km: "20",
    fixed_price: ""
  };
}

type Props = {
  driverId: string;
  disabled?: boolean;
};

export function DriverPayoutTableSection({ driverId, disabled }: Props) {
  const [rows, setRows] = useState<RowState[]>(() => PRIME_SERVICE_TYPES.map((s) => emptyRow(s.id)));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/drivers/${driverId}/payout-rules`, {}, "admin");
    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<{
        service_type: string;
        charge_type: PrimeChargeType;
        price_per_km: number | null;
        min_km: number | null;
        fixed_price: number | null;
      }>;
    };
    const byType = new Map(
      (json.data ?? []).map((r) => [normalizePrimeServiceType(r.service_type), r])
    );
    setRows(
      PRIME_SERVICE_TYPES.map((s) => {
        const saved = byType.get(s.id);
        if (!saved) return emptyRow(s.id);
        return {
          service_type: s.id,
          charge_type: saved.charge_type,
          price_per_km: saved.price_per_km != null ? String(saved.price_per_km) : "",
          min_km: saved.min_km != null ? String(saved.min_km) : "",
          fixed_price: saved.fixed_price != null ? String(saved.fixed_price) : ""
        };
      })
    );
    setLoading(false);
  }, [driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchRow(serviceType: string, patch: Partial<RowState>) {
    setRows((list) => list.map((r) => (r.service_type === serviceType ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const payload = rows
      .filter((r) => r.price_per_km || r.fixed_price)
      .map((r) => ({
        service_type: r.service_type,
        charge_type: r.charge_type,
        price_per_km: r.price_per_km ? Number(r.price_per_km) : null,
        min_km: r.min_km ? Number(r.min_km) : null,
        fixed_price: r.fixed_price ? Number(r.fixed_price) : null,
        active: true
      }));

    if (payload.length === 0) {
      setMessage({ kind: "error", text: "Preencha pelo menos uma linha de repasse." });
      setBusy(false);
      return;
    }

    const res = await fetchWithSupabaseSession(
      `/api/drivers/${driverId}/payout-rules`,
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
    setMessage({ kind: "success", text: "Repasse por tipo de serviço guardado." });
    void load();
  }

  if (loading) {
    return <p className="text-sm text-prime-muted">A carregar repasse…</p>;
  }

  return (
    <fieldset className="grid gap-3 md:col-span-2" disabled={disabled || busy}>
      <legend className="mb-1 text-sm font-semibold text-prime-text md:col-span-2">
        Repasse por tipo de serviço
      </legend>
      <p className="text-xs text-prime-muted md:col-span-2">
        Valores pagos ao motorista por tipo de serviço (independente da tabela do cliente). Usado na estimativa da
        corrida quando este motorista estiver seleccionado.
      </p>
      <div className="overflow-x-auto rounded-prime-card border border-prime-border bg-prime-card shadow-prime-card md:col-span-2">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-prime-border text-xs uppercase tracking-wide text-prime-muted">
              <th className="px-2 py-2">Tipo de serviço</th>
              <th className="px-2 py-2">Cobrança</th>
              <th className="px-2 py-2">Valor repasse</th>
              <th className="px-2 py-2">Km mín.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const perKm = r.charge_type === "per_km";
              return (
                <tr key={r.service_type} className="border-b border-prime-border/80">
                  <td className="px-2 py-2 font-medium">{primeServiceTypeLabel(r.service_type)}</td>
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
                        className={PRIME_INPUT_CLASS}
                        value={r.price_per_km}
                        onChange={(e) => patchRow(r.service_type, { price_per_km: e.target.value })}
                      />
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="md:col-span-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "A guardar…" : "Guardar repasse por serviço"}
        </button>
      </div>
      {message ? (
        <p
          className={`md:col-span-2 text-sm ${message.kind === "success" ? "text-prime-green" : "text-prime-red"}`}
          role="alert"
        >
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
