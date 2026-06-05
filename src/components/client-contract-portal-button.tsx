"use client";

import { useCallback, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Props = {
  clientId: string;
  devFallbackRole?: "cliente" | "admin";
};

export function ClientContractPortalButton({ clientId, devFallbackRole = "cliente" }: Props) {
  const [busy, setBusy] = useState(false);

  const openContract = useCallback(async () => {
    setBusy(true);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/contract/url`,
      {},
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; data?: { url?: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success || !json.data?.url) {
      window.alert(json.error?.message ?? "Contrato não disponível.");
      return;
    }
    window.open(json.data.url, "_blank", "noopener,noreferrer");
  }, [clientId, devFallbackRole]);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void openContract()}
      className="btn-outline shrink-0 px-4 py-2 text-sm disabled:opacity-50"
    >
      {busy ? "A abrir…" : "Ver contrato"}
    </button>
  );
}
