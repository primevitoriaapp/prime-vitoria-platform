"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

type L = { kind: string; status: string; complete_sent_at?: string | null; completed_at?: string | null; created_at: string };

/** Início do painel: motoristas do site esperando análise ou que travaram no meio do cadastro. */
export function SiteLeadsReminder() {
  const [n, setN] = useState<{ ready: number; filling: number; fresh: number } | null>(null);
  useEffect(() => {
    void fetch("/api/leads?kind=motorista", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: L[] }) => {
        if (!j.success) return;
        const open = (j.data ?? []).filter((l) => l.status !== "aprovado" && l.status !== "descartado");
        setN({
          ready: open.filter((l) => l.completed_at).length,
          filling: open.filter((l) => !l.completed_at && l.complete_sent_at).length,
          fresh: open.filter((l) => !l.completed_at && !l.complete_sent_at && l.status === "novo").length
        });
      })
      .catch(() => undefined);
  }, []);
  if (!n || !(n.ready + n.filling + n.fresh)) return null;
  const row = (href: string, icon: string, text: string, strong: boolean) => (
    <Link
      href={href as Route}
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${strong ? "bg-[#EAF6EF] font-semibold text-[#1F7A4C]" : "bg-prime-bg text-prime-text"}`}
    >
      <span>
        {icon} {text}
      </span>
      <span className="shrink-0 text-xs font-semibold text-prime-gold-ink">Ver →</span>
    </Link>
  );
  return (
    <section className="mb-3 grid gap-2 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Novos motoristas do site</p>
      {n.ready ? row("/cadastros-site?filtro=completo", "🟢", `${n.ready} motorista(s) mandaram tudo e esperam sua análise`, true) : null}
      {n.filling ? row("/cadastros-site?filtro=etapa2", "⏳", `${n.filling} começaram o cadastro completo e não terminaram`, false) : null}
      {n.fresh ? row("/cadastros-site?filtro=etapa1", "🆕", `${n.fresh} fizeram só o cadastro básico (mandar o link do completo)`, false) : null}
    </section>
  );
}
