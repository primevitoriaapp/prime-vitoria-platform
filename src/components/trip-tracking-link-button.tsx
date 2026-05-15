"use client";

import { useState } from "react";

type Props = {
  tripId: string;
  /** `dark`: estilos para fundos escuros (portal cliente). */
  variant?: "default" | "dark";
};

/** Gera token público (`POST /api/trips/:id/tracking-token`) e copia URL absoluta para a área de transferência. */
export function TripTrackingLinkButton({ tripId, variant = "default" }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/tracking-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { path?: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data?.path) {
        setMessage(json.error?.message ?? "Não foi possível gerar o link.");
        return;
      }
      const path = json.data.path;
      const url = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
      await navigator.clipboard.writeText(url);
      setMessage("Link copiado para a área de transferência.");
    } catch {
      setMessage("Erro de rede ao gerar link.");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onClick()}
        className={btnClass}
      >
        {busy ? "…" : "Link rastreio"}
      </button>
      {message ? <span className={msgClass}>{message}</span> : null}
    </div>
  );
}
