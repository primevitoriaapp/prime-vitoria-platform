"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Kind = "calendar" | "zapsign" | "infinitepay" | "whatsapp";

/** Lê se a integração já está pronta e o resumo de uma linha (ex.: "Chave final eoN0"). */
async function statusOf(kind: Kind): Promise<{ done: boolean; summary: string }> {
  const url = { calendar: "/api/integrations/calendar-feed", zapsign: "/api/integrations/zapsign", infinitepay: "/api/integrations/infinitepay", whatsapp: "/api/integrations/whatsapp-cloud" }[kind];
  const r = await fetchWithSupabaseSession(url, {}, "admin").catch(() => null);
  const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown> }) : {};
  const d = j.success ? (j.data ?? {}) : {};
  if (kind === "calendar") return { done: Boolean(d.url), summary: "Link de assinatura criado" };
  if (kind === "zapsign") return { done: Boolean(d.configured), summary: d.tail ? `Chave final ${String(d.tail)}` : "" };
  if (kind === "infinitepay") return { done: Boolean(d.configured), summary: d.handle ? `InfiniteTag ${String(d.handle)}` : "" };
  const mode = String(d.mode ?? "desligado");
  return { done: Boolean(d.configured), summary: mode === "ligado" ? "Ligado: enviando aos passageiros" : mode === "teste" ? "Conectado em modo teste (não envia aos passageiros)" : "Conectado, avisos desligados" };
}

/**
 * Integração já configurada vira uma linha curta "✓ Conectado · Alterar".
 * Só abre o quadro completo quando precisar trocar algo.
 */
export function IntegrationFold({ kind, title, children }: { kind: Kind; title: string; children: ReactNode }) {
  const [st, setSt] = useState<{ done: boolean; summary: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void statusOf(kind).then(setSt);
  }, [kind]);
  if (!st) return <div className="h-14 animate-pulse rounded-2xl bg-white" />;
  if (!st.done || open)
    return (
      <div className="space-y-2">
        {st.done ? (
          <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-prime-gold-ink">
            ▴ Recolher {title}
          </button>
        ) : null}
        {children}
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-prime-border bg-white px-4 py-3 shadow-prime-card">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">✓</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-xs text-prime-muted">Conectado{st.summary ? ` · ${st.summary}` : ""}</span>
      </span>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-prime-border">
        Ver / alterar
      </button>
    </div>
  );
}
