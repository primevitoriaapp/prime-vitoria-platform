"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = { tripId: string };

export function TripOperationalClaimBar({ tripId }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<{ operator_profile_id: string; claimed_at: string } | null | undefined>(
    undefined
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/trips/${tripId}/operational-claim`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) {
          setActive(null);
          setError(json?.error?.message ?? "Sem acesso à reivindicação.");
          return;
        }
        setActive((json.data?.active as typeof active) ?? null);
      })
      .catch(() => {
        setActive(null);
        setError("Falha de rede.");
      });
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/operational-claim`, {
        method: "POST",
        credentials: "include"
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? "Não foi possível assumir.");
        return;
      }
      await load();
      router.refresh();
    } catch {
      setError("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/operational-claim`, {
        method: "DELETE",
        credentials: "include"
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? "Não foi possível libertar.");
        return;
      }
      await load();
      router.refresh();
    } catch {
      setError("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  if (active === undefined) {
    return <p className="text-sm text-slate-500">A carregar estado de atendimento…</p>;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-amber-900">Multiatendimento</span>
          {active ? (
            <span className="ml-2 text-slate-700">
              Em atendimento por <span className="font-mono text-xs">{active.operator_profile_id.slice(0, 8)}…</span>
              {" · "}
              {new Date(active.claimed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          ) : (
            <span className="ml-2 text-slate-600">Ninguém assumiu o atendimento desta viagem.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || Boolean(active)}
            onClick={() => void claim()}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Assumir
          </button>
          <button
            type="button"
            disabled={busy || !active}
            onClick={() => void release()}
            className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Libertar
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
