"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Link secreto da agenda da Prime para assinar no Google Agenda ou no iPhone. */
export function CalendarFeedCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/integrations/calendar-feed", {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { data?: { url: string | null } };
      setUrl(json.data?.url ?? null);
      setLoaded(true);
    })();
  }, []);

  async function create(confirmFirst: boolean) {
    if (confirmFirst && !window.confirm("Trocar o link? Quem assinou o link antigo para de receber as corridas e precisa assinar o novo.")) return;
    setBusy(true);
    setErr(null);
    const res = await fetchWithSupabaseSession("/api/integrations/calendar-feed", { method: "POST" }, "admin");
    const json = (await res.json().catch(() => ({}))) as { data?: { url: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.data?.url) {
      setErr(json.error?.message ?? "Não foi possível criar o link.");
      return;
    }
    setUrl(json.data.url);
    setCopied(false);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setErr("Não deu para copiar: selecione o link e copie à mão.");
    }
  }

  return (
    <section className="rounded-2xl border-2 border-prime-gold/60 bg-white p-5 shadow-prime-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📅 Corridas da Prime no seu Google Agenda</h2>
          <p className="mt-1 text-sm text-prime-muted">
            Todas as corridas (14 dias para trás e 90 para frente) aparecem sozinhas no Google Agenda ou no calendário do iPhone. Sem valores.
          </p>
        </div>
      </div>

      {!loaded ? (
        <p className="mt-4 text-sm text-prime-muted">Carregando…</p>
      ) : !url ? (
        <button type="button" onClick={() => void create(false)} disabled={busy} className="btn-primary mt-4">
          {busy ? "Criando…" : "Criar o link da agenda"}
        </button>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-prime-border bg-prime-surface px-3 py-2 font-mono text-xs" />
            <button type="button" onClick={() => void copy()} className="btn-primary shrink-0">
              {copied ? "Copiado ✓" : "Copiar link"}
            </button>
          </div>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
            <li>
              No <b>computador</b>, abra <b>calendar.google.com</b> (o app do celular não tem essa opção).
            </li>
            <li>
              Na esquerda, ao lado de <b>“Outras agendas”</b>, clique em <b>+</b> → <b>“Do URL”</b>.
            </li>
            <li>
              Cole o link e clique em <b>“Adicionar agenda”</b>. Em poucos minutos as corridas aparecem — também no celular.
            </li>
            <li className="text-prime-muted">
              No iPhone: Ajustes → Calendário → Contas → Adicionar conta → Outra → “Adicionar calendário assinado”.
            </li>
          </ol>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O Google atualiza agendas assinadas a cada algumas horas, não na hora. Para a operação do dia, use a Agenda do sistema.
            <br />
            <b>Não compartilhe este link</b>: quem tiver ele vê as corridas (nomes, endereços e telefones dos passageiros).
          </p>
          <button type="button" onClick={() => void create(true)} disabled={busy} className="mt-3 text-sm text-prime-muted underline">
            {busy ? "Trocando…" : "Trocar o link (se ele vazou)"}
          </button>
        </>
      )}
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </section>
  );
}
