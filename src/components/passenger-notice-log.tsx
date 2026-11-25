"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Log = { id: string; kind: string; phone: string; person_name: string | null; status: string; detail: string | null; preview: string | null; created_at: string };
const KIND_PT: Record<string, string> = {
  confirmado: "Confirmado",
  a_caminho: "A caminho",
  avaliacao: "Avaliação",
  motorista_nova: "Nova corrida",
  motorista_alterada: "Corrida alterada",
  motorista_cancelada: "Corrida cancelada/retirada"
};
const STATUS_PT: Record<string, { t: string; cls: string }> = {
  enviada: { t: "Enviada", cls: "bg-emerald-50 text-emerald-800" },
  simulada: { t: "Teste (não enviada)", cls: "bg-amber-50 text-amber-900" },
  pulada: { t: "Não precisou", cls: "bg-gray-100 text-gray-700" },
  falhou: { t: "Falhou", cls: "bg-red-50 text-red-800" }
};

/** Histórico dos avisos automáticos (passageiros e motoristas). */
export function PassengerNoticeLog() {
  const [log, setLog] = useState<Log[] | null>(null);
  const [mode, setMode] = useState("");
  const [live, setLive] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/integrations/whatsapp-cloud", {}, "admin")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setLog(j.data.log ?? []);
          setMode(j.data.mode);
          setLive(j.data.live ?? []);
        } else setLog([]);
      })
      .catch(() => setLog([]));
  }, []);
  if (!log) return <div className="h-24 animate-pulse rounded-2xl bg-white" />;
  return (
    <section className="grid gap-2 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Avisos automáticos (passageiros e motoristas)</h3>
        <span className="text-xs text-prime-muted">
          {mode === "ligado"
            ? "Ligado para todos"
            : mode === "teste"
              ? live.length
                ? `Enviando de verdade para: ${live.join(" e ")}`
                : "Modo teste: nada é enviado de verdade"
              : "Desligado"}
        </span>
      </div>
      {log.length ? (
        <ul className="divide-y divide-prime-border rounded-xl border border-prime-border text-sm">
          {log.map((l) => {
            const st = STATUS_PT[l.status] ?? { t: l.status, cls: "bg-gray-100 text-gray-700" };
            return (
              <li key={l.id} className="px-3 py-2">
                <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                  <span className="min-w-0">
                    <b>{KIND_PT[l.kind] ?? l.kind}</b> · {l.person_name ?? "Passageiro"} <span className="text-prime-muted">· {l.phone}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-prime-muted">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>{st.t}</span>
                    {new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
                {open === l.id ? (
                  <div className="mt-2 space-y-1">
                    {l.detail && l.status !== "enviada" ? <p className="text-xs text-prime-muted">Motivo: {l.detail}</p> : null}
                    {l.preview ? <pre className="whitespace-pre-wrap rounded-lg bg-[#ECE5DD] px-3 py-2 font-sans text-sm">{l.preview}</pre> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-prime-muted">Nenhum aviso ainda.</p>
      )}
    </section>
  );
}
