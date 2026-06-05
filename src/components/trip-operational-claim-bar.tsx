"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { OPERATIONAL_CLAIM_CHANGED } from "@/lib/client/operational-claim-events";

type Props = {
  tripId: string;
  devFallbackRole?: "operador" | "admin";
  variant?: "default" | "minimal";
};

export function TripOperationalClaimBar({
  tripId,
  devFallbackRole = "operador",
  variant = "default"
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<
    | {
        operator_profile_id: string;
        claimed_at: string;
        operator_name?: string | null;
      }
    | null
    | undefined
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
      setError(json.error?.message ?? "Sem acesso.");
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

  if (active === undefined) {
    return variant === "minimal" ? (
      <div className="h-10 animate-pulse rounded-lg bg-prime-bg" aria-busy="true" />
    ) : (
      <div className="animate-pulse rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3" aria-busy="true">
        <div className="h-4 w-48 rounded bg-amber-100" />
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {active ? (
          <p className="text-sm text-prime-muted">
            Em atendimento por{" "}
            <span className="font-medium text-prime-text">
              {active.operator_name?.trim() || "operador"}
            </span>
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void claim()}
            className="btn-primary min-h-[2.75rem] px-5 disabled:opacity-50"
          >
            {busy ? "A assumir…" : "Assumir atendimento"}
          </button>
        )}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-amber-900">Multiatendimento</span>
          {active ? (
            <p className="mt-0.5 text-slate-700">
              Em atendimento por{" "}
              <span className="font-medium">{active.operator_name?.trim() || "operador"}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-slate-600">Ninguém assumiu esta viagem.</p>
          )}
        </div>
        {!active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void claim()}
            className="min-h-[2.5rem] rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? "A assumir…" : "Assumir atendimento"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
