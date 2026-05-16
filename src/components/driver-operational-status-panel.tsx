"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import {
  DRIVER_OPERATIONAL_STATUS_PT,
  isDriverOperationalStatus
} from "@/lib/drivers/operational-status";
import type { DriverOperationalStatus } from "@/lib/domain/types";

type Props = {
  devFallbackRole?: "motorista";
};

export function DriverOperationalStatusPanel({ devFallbackRole = "motorista" }: Props) {
  const [status, setStatus] = useState<DriverOperationalStatus>("offline");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession("/api/drivers/operational-status", {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { status?: string; updated_at?: string | null };
      error?: { message?: string };
    };
    setLoading(false);
    if (!res.ok || !json.success || !json.data) {
      setMessage(json.error?.message ?? "Não foi possível carregar estado do motorista.");
      return;
    }
    if (isDriverOperationalStatus(json.data.status)) setStatus(json.data.status);
    setUpdatedAt(json.data.updated_at ?? null);
    setMessage(null);
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setManualStatus(next: "online" | "offline") {
    setLoading(true);
    const res = await fetchWithSupabaseSession(
      "/api/drivers/operational-status",
      { method: "POST", body: JSON.stringify({ status: next }) },
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { status?: string; updated_at?: string | null };
      error?: { message?: string };
    };
    setLoading(false);
    if (!res.ok || !json.success || !json.data) {
      setMessage(json.error?.message ?? "Falha ao actualizar disponibilidade.");
      return;
    }
    if (isDriverOperationalStatus(json.data.status)) setStatus(json.data.status);
    setUpdatedAt(json.data.updated_at ?? null);
    setMessage(`Estado: ${DRIVER_OPERATIONAL_STATUS_PT[next]}.`);
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Estado operacional</h2>
          <p className="mt-1 text-lg font-semibold text-white">{DRIVER_OPERATIONAL_STATUS_PT[status]}</p>
          {updatedAt ? (
            <p className="mt-1 text-xs text-slate-500">
              Actualizado {new Date(updatedAt).toLocaleString("pt-BR", { timeStyle: "short", dateStyle: "short" })}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void setManualStatus("online")}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            Online
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void setManualStatus("offline")}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Offline
          </button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-amber-200/90">{message}</p> : null}
    </section>
  );
}
