"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** "Só trabalha à vista": repasse sai logo depois da corrida, sem esperar o cliente pagar. */
export function DriverUpfrontToggle({ driverId }: { driverId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/drivers/${driverId}/payout-terms`, {}, "admin")
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { paid_upfront: boolean } }) => setOn(Boolean(j.data?.paid_upfront)))
      .catch(() => setOn(false));
  }, [driverId]);
  if (on == null) return null;
  return (
    <div className="md:col-span-2 rounded-xl border border-prime-border bg-prime-bg/50 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={on}
          onChange={async (e) => {
            const v = e.target.checked;
            setOn(v);
            setMsg("Salvando…");
            const r = await fetchWithSupabaseSession(`/api/drivers/${driverId}/payout-terms`, { method: "PATCH", body: JSON.stringify({ paid_upfront: v }) }, "admin");
            const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { repasses_atualizados: number } };
            setMsg(j.success ? `Salvo.${j.data?.repasses_atualizados ? ` ${j.data.repasses_atualizados} repasse(s) em aberto com a data atualizada.` : ""}` : "Não foi possível salvar.");
          }}
        />
        <span>
          <b>Só trabalha à vista</b> — o repasse fica liberado para pagar logo depois da corrida, sem esperar o cliente pagar a Prime.
        </span>
      </label>
      {msg ? <p className="mt-1 text-xs text-prime-muted">{msg}</p> : null}
    </div>
  );
}
