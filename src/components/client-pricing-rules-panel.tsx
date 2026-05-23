"use client";

import { useCallback, useEffect, useState } from "react";

type PricingRule = {
  id: string;
  client_id: string;
  name: string;
  calculation_type: string;
  active: boolean;
  priority: number;
  fixed_price: number | null;
  price_per_km: number | null;
  minimum_km: number | null;
  minimum_value: number | null;
  settings: Record<string, unknown>;
};

type Props = {
  clientId: string;
  clientName: string;
};

export function ClientPricingRulesPanel({ clientId, clientName }: Props) {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "Km com mínimo",
    calculation_type: "km_with_minimum",
    price_per_km: "5",
    minimum_km: "20",
    fixed_price: "180",
    daily_amount: "700",
    driver_price_per_km: "2.5",
    driver_minimum_km: "20",
    driver_fixed_price: "150",
    driver_daily_amount: "350"
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/pricing/rules?client_id=${clientId}&pageSize=20`, { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: { items: PricingRule[] } };
    setRules(res.ok && json.success ? (json.data?.items ?? []) : []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const driverBlock =
      form.calculation_type === "fixed_price"
        ? { calculation_type: "fixed_price", fixed_price: Number(form.driver_fixed_price) }
        : form.calculation_type === "daily_rate"
          ? { calculation_type: "daily_rate", daily_amount: Number(form.driver_daily_amount) }
          : {
              calculation_type: "km_with_minimum",
              price_per_km: Number(form.driver_price_per_km),
              minimum_km: Number(form.driver_minimum_km)
            };

    const body: Record<string, unknown> = {
      client_id: clientId,
      name: form.name.trim(),
      calculation_type: form.calculation_type,
      settings: { driver: driverBlock }
    };
    if (form.calculation_type === "km_with_minimum") {
      body.price_per_km = Number(form.price_per_km);
      body.minimum_km = Number(form.minimum_km);
    } else if (form.calculation_type === "fixed_price") {
      body.fixed_price = Number(form.fixed_price);
    } else if (form.calculation_type === "daily_rate") {
      body.fixed_price = Number(form.daily_amount);
    }
    const res = await fetch("/api/pricing/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao criar regra.");
      return;
    }
    setMessage("Regra criada.");
    await load();
  }

  async function deactivateRule(id: string) {
    if (!window.confirm("Desactivar esta regra?")) return;
    await fetch(`/api/pricing/rules/${id}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Precificação — {clientName}</h3>
      <p className="mt-1 text-xs text-slate-600">
        Regras aplicadas automaticamente ao concluir corrida (km faturável, valor cliente/motorista).
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">A carregar regras…</p>
      ) : rules.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhuma regra activa. Crie abaixo.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2">
              <span>
                <strong>{r.name}</strong> · {r.calculation_type}
                {r.minimum_km != null ? ` · mín. ${r.minimum_km} km` : ""}
                {r.price_per_km != null ? ` · R$ ${r.price_per_km}/km` : ""}
                {!r.active ? " (inactiva)" : ""}
              </span>
              {r.active ? (
                <button type="button" onClick={() => void deactivateRule(r.id)} className="text-xs text-red-600 hover:underline">
                  Desactivar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void createRule(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          Nome
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="text-xs text-slate-600">
          Tipo
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={form.calculation_type}
            onChange={(e) => setForm((f) => ({ ...f, calculation_type: e.target.value }))}
          >
            <option value="km_with_minimum">Km com mínimo</option>
            <option value="fixed_price">Valor fixo</option>
            <option value="daily_rate">Diária</option>
            <option value="hourly_plus_extra">Hora + excedente</option>
            <option value="event_package">Pacote / evento</option>
          </select>
        </label>
        {form.calculation_type === "km_with_minimum" ? (
          <>
            <label className="text-xs text-slate-600">
              R$/km cliente
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.price_per_km}
                onChange={(e) => setForm((f) => ({ ...f, price_per_km: e.target.value }))}
              />
            </label>
            <label className="text-xs text-slate-600">
              Km mínimo
              <input
                type="number"
                min="0"
                step="0.1"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.minimum_km}
                onChange={(e) => setForm((f) => ({ ...f, minimum_km: e.target.value }))}
              />
            </label>
            <label className="text-xs text-slate-600">
              Km mínimo motorista
              <input
                type="number"
                min="0"
                step="0.1"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.driver_minimum_km}
                onChange={(e) => setForm((f) => ({ ...f, driver_minimum_km: e.target.value }))}
              />
            </label>
            <label className="text-xs text-slate-600">
              R$/km motorista
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.driver_price_per_km}
                onChange={(e) => setForm((f) => ({ ...f, driver_price_per_km: e.target.value }))}
              />
            </label>
          </>
        ) : form.calculation_type === "fixed_price" ? (
          <>
            <label className="text-xs text-slate-600">
              Valor fixo cliente (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.fixed_price}
                onChange={(e) => setForm((f) => ({ ...f, fixed_price: e.target.value }))}
              />
            </label>
            <label className="text-xs text-slate-600">
              Repasse motorista (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.driver_fixed_price}
                onChange={(e) => setForm((f) => ({ ...f, driver_fixed_price: e.target.value }))}
              />
            </label>
          </>
        ) : form.calculation_type === "daily_rate" ? (
          <>
            <label className="text-xs text-slate-600">
              Diária cliente (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.daily_amount}
                onChange={(e) => setForm((f) => ({ ...f, daily_amount: e.target.value }))}
              />
            </label>
            <label className="text-xs text-slate-600">
              Repasse motorista diária (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={form.driver_daily_amount}
                onChange={(e) => setForm((f) => ({ ...f, driver_daily_amount: e.target.value }))}
              />
            </label>
          </>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "A guardar…" : "Adicionar regra"}
          </button>
        </div>
      </form>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
