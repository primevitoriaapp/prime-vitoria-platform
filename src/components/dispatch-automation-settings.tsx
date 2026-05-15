"use client";

import { useEffect, useState } from "react";

type Settings = {
  tenant_id: string;
  auto_offer_on_approve: boolean;
  auto_direct_assign_on_approve: boolean;
  offer_expires_seconds: number;
  max_offer_candidates: number;
  require_operational_claim: boolean;
};

export function DispatchAutomationSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/tenant/dispatch-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (body?.success && body.data) {
          setData(body.data as Settings);
        } else {
          setError(body?.error?.message ?? "Nao foi possivel carregar configuracoes");
        }
      })
      .catch(() => setError("Falha de rede ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const save = () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    fetch("/api/tenant/dispatch-settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_offer_on_approve: data.auto_offer_on_approve,
        auto_direct_assign_on_approve: data.auto_direct_assign_on_approve,
        offer_expires_seconds: data.offer_expires_seconds,
        max_offer_candidates: data.max_offer_candidates,
        require_operational_claim: data.require_operational_claim
      })
    })
      .then((r) => r.json())
      .then((body) => {
        if (body?.success && body.data) {
          setData(body.data as Settings);
          setSavedOk(true);
        } else {
          setError(body?.error?.message ?? "Erro ao gravar");
        }
      })
      .catch(() => setError("Falha de rede ao gravar"))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        A carregar automação de despacho…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Automação de despacho</h3>
      <p className="mt-1 text-sm text-slate-600">
        Após aprovar uma viagem, escolha um modo (são mutuamente exclusivos): oferta envia o pedido aos parceiros
        elegíveis; despacho direto atribui automaticamente um motorista (o primeiro disponível na fila) e só ele recebe
        a notificação de despacho, como no despacho direcionado manual.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={data.auto_offer_on_approve}
            onChange={(e) => {
              const on = e.target.checked;
              setData({
                ...data,
                auto_offer_on_approve: on,
                auto_direct_assign_on_approve: on ? false : data.auto_direct_assign_on_approve
              });
            }}
          />
          Oferta automática (parceiros elegíveis)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={data.auto_direct_assign_on_approve}
            onChange={(e) => {
              const on = e.target.checked;
              setData({
                ...data,
                auto_direct_assign_on_approve: on,
                auto_offer_on_approve: on ? false : data.auto_offer_on_approve
              });
            }}
          />
          Despacho direto automático (apenas o motorista atribuído)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">Expiração da oferta (segundos)</span>
            <input
              type="number"
              min={30}
              max={3600}
              disabled={!data.auto_offer_on_approve}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-slate-900 disabled:opacity-50"
              value={data.offer_expires_seconds}
              onChange={(e) => setData({ ...data, offer_expires_seconds: Number(e.target.value) || 180 })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Máx. motoristas na oferta</span>
            <input
              type="number"
              min={1}
              max={50}
              disabled={!data.auto_offer_on_approve}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-slate-900 disabled:opacity-50"
              value={data.max_offer_candidates}
              onChange={(e) => setData({ ...data, max_offer_candidates: Number(e.target.value) || 8 })}
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={data.require_operational_claim}
            onChange={(e) => setData({ ...data, require_operational_claim: e.target.checked })}
          />
          Exigir &quot;Assumir atendimento&quot; antes de despacho, ofertas e notas internas
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {savedOk ? <p className="mt-2 text-sm text-emerald-700">Guardado.</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {saving ? "A gravar…" : "Guardar"}
      </button>
    </div>
  );
}
