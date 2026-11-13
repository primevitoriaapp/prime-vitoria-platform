"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Liga/desliga os avisos de WhatsApp aos passageiros desta empresa. */
export function ClientNotifyPassengersToggle({ clientId }: { clientId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/clients/${clientId}/notify-passengers`, {}, "admin")
      .then((r) => r.json())
      .then((j) => j?.success && setEnabled(j.data.enabled))
      .catch(() => undefined);
  }, [clientId]);
  async function toggle(v: boolean) {
    setBusy(true);
    const r = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/notify-passengers`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: v }) },
      "admin"
    ).catch(() => null);
    setBusy(false);
    if (r?.ok) setEnabled(v);
  }
  if (enabled === null) return null;
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-prime-border bg-white p-4 text-sm shadow-prime-card">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
      <span>
        <span className="font-semibold">Avisar os passageiros pelo WhatsApp</span>
        <span className="block text-prime-muted">Motorista confirmado (véspera), a caminho (com link) e pedido de avaliação. Desmarque se esta empresa não quer que os passageiros recebam.</span>
      </span>
    </label>
  );
}
