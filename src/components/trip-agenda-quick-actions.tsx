"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { TripOperationalStatus } from "@/lib/domain/types";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  devFallbackRole?: "operador" | "admin";
  onDone?: () => void;
};

export function TripAgendaQuickActions({ tripId, operationalStatus, devFallbackRole = "operador", onDone }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function approve() {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/approve`,
      { method: "POST", body: JSON.stringify({}) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao aprovar.");
      return;
    }
    setMessage("Corrida aprovada.");
    onDone?.();
  }

  if (operationalStatus !== "requested") {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <span className="text-amber-900">Pendente de aprovação</span>
      <button type="button" disabled={loading} onClick={() => void approve()} className="font-medium text-amber-800">
        {loading ? "A aprovar…" : "Aprovar corrida"}
      </button>
      {message ? <span className="text-slate-700">{message}</span> : null}
    </div>
  );
}
