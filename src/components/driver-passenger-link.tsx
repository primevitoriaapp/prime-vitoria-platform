"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

const LIVE = ["on_the_way", "arrived", "in_progress"];

/** Botão para o motorista mandar ao passageiro o link de acompanhamento em tempo real (expira no fim da corrida). */
export function DriverPassengerLink({ tripId, status, devFallbackRole }: { tripId: string; status: string; devFallbackRole: "motorista" | "admin" }) {
  const [data, setData] = useState<{ url: string; phone: string | null; whatsapp_url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const live = LIVE.includes(status);

  useEffect(() => {
    if (!live) {
      setData(null);
      return;
    }
    let off = false;
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/passenger-link`, {}, devFallbackRole);
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { available: boolean; url: string; phone: string | null; whatsapp_url: string } };
      if (!off && j.success && j.data?.available) setData(j.data);
    })();
    return () => {
      off = true;
    };
  }, [tripId, live, devFallbackRole]);

  if (!live || !data) return null;
  return (
    <div className="rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-3">
      <p className="text-sm font-semibold text-[#F5F5F5]">Avise o passageiro</p>
      <p className="mt-0.5 text-xs text-[#AAAAAA]">Ele acompanha o carro no mapa até o embarque. O link para de funcionar quando a corrida termina.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={data.whatsapp_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#111]"
        >
          {data.phone ? "Enviar pelo WhatsApp" : "Escolher contato no WhatsApp"}
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(data.url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="rounded-xl border border-[#3A3A3E] px-3 py-2 text-sm text-[#F5F5F5]"
        >
          {copied ? "Copiado" : "Copiar link"}
        </button>
      </div>
    </div>
  );
}
