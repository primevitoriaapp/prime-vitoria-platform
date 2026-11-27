"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Conv = { wa_id: string; name: string | null; profile_name: string | null; last_message_at: string | null; last_inbound_at: string | null; last_preview: string | null; unread: number };
type Msg = { id: string; wa_message_id: string | null; direction: "in" | "out"; source: string; type: string; body: string | null; status: string | null; error: string | null; ts: string };
type Thread = { contact: Conv; window_open: boolean; window_ends_at: string | null; messages: Msg[] };
type ListInfo = { mode: string; can_send: boolean; provider: string; conversations: Conv[] };

const fmtPhone = (wa: string) => {
  const d = wa.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) {
    const n = d.slice(4);
    return `(${d.slice(2, 4)}) ${n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`}`;
  }
  return `+${d}`;
};
const title = (c: Conv) => c.name || c.profile_name || fmtPhone(c.wa_id);
const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const day = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return day === today
    ? d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
};
const TICK: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓", failed: "⚠", teste: "🧪" };
const SOURCE: Record<string, string> = { app: "pelo app", plataforma: "pela plataforma", historico: "" };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  const r = await fetchWithSupabaseSession(url, init ?? {}, "admin").catch(() => null);
  const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string } }) : {};
  return r?.ok && j.success ? { ok: true, data: j.data } : { ok: false, error: j.error?.message ?? "Sem conexão. Tente de novo." };
}

/** Conversas do WhatsApp da central (coexistência: o app do celular continua funcionando junto). */
export function WhatsappInbox() {
  const [list, setList] = useState<ListInfo | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    const r = await call<ListInfo>(`/api/whatsapp/inbox${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
    if (r.ok && r.data) setList(r.data);
  }, [q]);
  const loadThread = useCallback(async (wa: string) => {
    const r = await call<Thread>(`/api/whatsapp/inbox/${wa}`);
    if (r.ok && r.data) setThread(r.data);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);
  useEffect(() => {
    const t = setInterval(() => {
      // Aba escondida não consulta (economia de servidor); volta ao normal quando a aba aparece.
      if (typeof document !== "undefined" && document.hidden) return;
      void loadList();
      if (sel) void loadThread(sel);
    }, 15_000);
    return () => clearInterval(t);
  }, [loadList, loadThread, sel]);
  useEffect(() => {
    if (sel) void loadThread(sel);
    else setThread(null);
    setErr(null);
  }, [sel, loadThread]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  async function send() {
    if (!sel || !text.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await call<{ test_mode: boolean }>(`/api/whatsapp/inbox/${sel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Não foi enviado.");
    setText("");
    void loadThread(sel);
    void loadList();
  }

  const convs = list?.conversations ?? [];
  return (
    <div className="space-y-3">
      {list && !list.can_send ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Modo teste:</b> as mensagens dos clientes já aparecem aqui, mas as respostas escritas aqui <b>não são enviadas</b> (ficam marcadas 🧪). Continue respondendo pelo app do celular da central até ligarmos o envio.
        </p>
      ) : null}
      <div className="grid h-[calc(100dvh-230px)] min-h-[480px] overflow-hidden rounded-2xl border border-prime-border bg-white md:grid-cols-[340px_1fr]">
        {/* Lista */}
        <div className={`min-h-0 flex-col border-prime-border md:flex md:border-r ${sel ? "hidden" : "flex"}`}>
          <div className="border-b border-prime-border p-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou número" className="w-full rounded-xl border border-prime-border bg-prime-bg px-3 py-2 text-base md:text-sm" />
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-prime-border overflow-y-auto overscroll-contain">
            {!list ? <li className="p-4 text-sm text-prime-muted">Carregando…</li> : null}
            {list && !convs.length ? <li className="p-4 text-sm text-prime-muted">Nenhuma conversa ainda. Quando um cliente mandar mensagem para a central, ela aparece aqui.</li> : null}
            {convs.map((c) => (
              <li key={c.wa_id}>
                <button type="button" onClick={() => setSel(c.wa_id)} className={`flex w-full items-start gap-3 px-3 py-2.5 text-left ${sel === c.wa_id ? "bg-[#FBF6E9]" : "hover:bg-prime-bg"}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EDE8DC] text-sm font-bold text-[#7A5C16]">{title(c).replace(/[^A-Za-zÀ-ú0-9]/g, "").charAt(0).toUpperCase() || "?"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread ? "font-bold" : "font-semibold"}`}>{title(c)}</span>
                      <span className={`shrink-0 text-[11px] ${c.unread ? "font-bold text-[#1F7A4C]" : "text-prime-muted"}`}>{when(c.last_message_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-prime-muted">{c.last_preview}</span>
                      {c.unread ? <span className="shrink-0 rounded-full bg-[#1F7A4C] px-1.5 text-[11px] font-bold text-white">{c.unread}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Conversa */}
        <div className={`min-h-0 flex-col bg-[#F7F4EE] md:flex ${sel ? "flex" : "hidden"}`}>
          {!sel ? (
            <div className="m-auto p-6 text-center text-sm text-prime-muted">Escolha uma conversa à esquerda.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-prime-border bg-white px-3 py-2">
                <button type="button" onClick={() => setSel(null)} className="rounded-lg px-2 py-1 text-lg md:hidden" aria-label="Voltar">
                  ←
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{thread ? title(thread.contact) : "…"}</p>
                  <p className="text-xs text-prime-muted">{fmtPhone(sel)}</p>
                </div>
                <a href={`https://wa.me/${sel}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg px-2 py-1 text-xs ring-1 ring-prime-border">
                  Abrir no WhatsApp
                </a>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3">
                {(thread?.messages ?? []).map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm ${m.direction === "out" ? "rounded-br-md bg-[#DCF3D0]" : "rounded-bl-md bg-white"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-0.5 text-right text-[10px] text-prime-muted">
                        {m.direction === "out" && SOURCE[m.source] ? `${SOURCE[m.source]} · ` : ""}
                        {new Date(m.ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {m.direction === "out" && m.status ? <span className={`ml-1 ${m.status === "read" ? "text-sky-600" : m.status === "failed" ? "text-red-600" : ""}`}>{TICK[m.status] ?? ""}</span> : null}
                      </p>
                      {m.error ? <p className="text-[11px] text-red-700">{m.error}</p> : null}
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <div className="border-t border-prime-border bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {thread && !thread.window_open ? (
                  <p className="mb-2 rounded-lg bg-prime-bg px-2 py-1.5 text-xs text-prime-muted">
                    Mais de 24 horas sem mensagem desse contato: pela regra do WhatsApp, só dá para responder pelo app do celular ou com um modelo aprovado.
                  </p>
                ) : null}
                {err ? <p className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">{err}</p> : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={1}
                    disabled={!thread?.window_open}
                    placeholder={list?.can_send ? "Escreva a resposta" : "Escreva (modo teste: não envia)"}
                    className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-prime-border px-3 py-2 text-base disabled:bg-prime-bg md:text-sm"
                  />
                  <button type="button" disabled={busy || !text.trim() || !thread?.window_open} onClick={() => void send()} className="h-[42px] shrink-0 rounded-xl bg-[#111] px-4 text-sm font-semibold text-prime-gold disabled:opacity-40">
                    {busy ? "…" : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
