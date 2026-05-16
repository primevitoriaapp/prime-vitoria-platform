"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { OPERATIONAL_CLAIM_CHANGED } from "@/lib/client/operational-claim-events";

type Props = { tripId: string; devFallbackRole?: "operador" | "admin" };

export function TripOperationalClaimBar({ tripId, devFallbackRole = "operador" }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<
    {
      operator_profile_id: string;
      claimed_at: string;
      operator_name?: string | null;
      age_minutes?: number;
      stale?: boolean;
    } | null | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/operational-claim`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { active: typeof active };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setActive(null);
      setError(json.error?.message ?? "Sem acesso à reivindicação.");
      return;
    }
    setActive(json.data?.active ?? null);
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tripId?: string }>).detail;
      if (!detail?.tripId || detail.tripId === tripId) void load();
    };
    window.addEventListener(OPERATIONAL_CLAIM_CHANGED, onChanged);
    return () => window.removeEventListener(OPERATIONAL_CLAIM_CHANGED, onChanged);
  }, [tripId, load]);

  async function claim() {
    setBusy(true);
    setError(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/operational-claim`,
      { method: "POST", body: JSON.stringify({}) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Não foi possível assumir.");
      return;
    }
    await load();
    router.refresh();
  }

  async function release() {
    setBusy(true);
    setError(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/operational-claim`,
      { method: "DELETE" },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Não foi possível libertar.");
      return;
    }
    await load();
    router.refresh();
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
              Em atendimento por{" "}
              <span className="font-medium">{active.operator_name?.trim() || active.operator_profile_id.slice(0, 8)}</span>
              {" · "}
              {new Date(active.claimed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {active.age_minutes != null ? ` · ha ${active.age_minutes} min` : ""}
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
      {active?.stale ? (
        <p className="mt-2 text-xs font-medium text-amber-900">
          Atendimento parado há mais de 45 min. Se necessário, contacte admin para libertar.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
