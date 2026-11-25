"use client";

import { useState } from "react";
import { WhatsappInbox } from "@/components/whatsapp-inbox";
import { WhatsappPanel } from "@/components/whatsapp-panel";

/** Página WhatsApp: conversas da central + avisos de cada corrida. */
export function WhatsappTabs({ tenantId }: { tenantId: string | null }) {
  const [tab, setTab] = useState<"conversas" | "avisos">("conversas");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(
          [
            ["conversas", "Conversas da central"],
            ["avisos", "Avisos das corridas"]
          ] as const
        ).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? "bg-[#111] text-[#D9BC6A]" : "bg-white ring-1 ring-prime-border"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "conversas" ? <WhatsappInbox /> : <WhatsappPanel tenantId={tenantId} />}
    </div>
  );
}
