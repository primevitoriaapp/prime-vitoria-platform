"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Props = {
  tripId: string;
  variant?: "default" | "dark";
  devFallbackRole?: "cliente" | "operador" | "admin";
};

/** Gera token público e copia ou abre `/r/<token>`. */
export function TripTrackingLinkButton({ tripId, variant = "default", devFallbackRole }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createToken(): Promise<string | null> {
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/tracking-token`,
      { method: "POST", body: JSON.stringify({}) },
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { path?: string };
      error?: { message?: string };
    };
    if (!res.ok || !json.success || !json.data?.path) {
      setMessage(json.error?.message ?? "Não foi possível gerar o link.");
      return null;
    }
    const path = json.data.path;
    return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function copyLink() {
    setMessage(null);
    setBusy(true);
    try {
      const url = await createToken();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      setMessage("Link copiado.");
    } catch {
      setMessage("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function openTrack() {
    setMessage(null);
    setBusy(true);
    try {
      const url = await createToken();
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("Rastreio aberto.");
    } catch {
      setMessage("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  const isDark = variant === "dark";
  const btnClass = isDark
    ? "rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-amber-400 hover:bg-slate-700 disabled:opacity-50"
    : "rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50";
  const msgClass = isDark ? "max-w-[14rem] text-xs text-slate-400" : "max-w-[14rem] text-xs text-slate-600";

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void copyLink()} className={btnClass}>
          Copiar link
        </button>
        <button type="button" disabled={busy} onClick={() => void openTrack()} className={btnClass}>
          Abrir rastreio
        </button>
      </div>
      {message ? <span className={msgClass}>{message}</span> : null}
    </div>
  );
}
