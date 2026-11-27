"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Gate = { required: boolean; signed: boolean; sign_url: string | null; title: string | null };

/** Motorista novo: só aceita corridas depois de assinar o contrato. Some sozinho quando assinar. */
export function DriverContractBanner() {
  const [g, setG] = useState<Gate | null>(null);
  useEffect(() => {
    const load = () =>
      void fetchWithSupabaseSession("/api/drivers/me/contract-gate", {}, "motorista")
        .then((r) => r.json())
        .then((j: { success?: boolean; data?: Gate }) => j.success && j.data && setG(j.data))
        .catch(() => undefined);
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  if (!g || !g.required || g.signed) return null;
  return (
    <div className="pointer-events-auto mx-auto mt-2 max-w-lg rounded-2xl bg-[#111] p-4 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D9BC6A]">Falta 1 passo</p>
      <p className="mt-1 text-[15px] font-semibold">Assine seu contrato para começar a receber corridas</p>
      <p className="mt-1 text-xs text-white/70">Leva 2 minutos. Depois de assinar, volte aqui: as corridas já ficam liberadas.</p>
      {g.sign_url ? (
        <a href={g.sign_url} target="_blank" rel="noreferrer" className="mt-3 block rounded-xl bg-[#D9BC6A] px-4 py-3 text-center text-[15px] font-bold text-[#111]">
          ✍️ Assinar contrato
        </a>
      ) : (
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs">O contrato está sendo preparado pela central. Se demorar, fale com a Prime pelo WhatsApp.</p>
      )}
    </div>
  );
}
