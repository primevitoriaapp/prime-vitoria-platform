"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_SURFACE_CARD } from "@/lib/ui/prime-surface-card";

type Person = { driver_id: string; name: string; phone: string | null; at?: string | null };
type Msg = {
  id: string;
  title: string;
  body: string;
  contact_hint: string | null;
  ask_interest: boolean;
  target_category_ids: string[] | null;
  created_at: string;
  expires_at: string | null;
  active: boolean;
  total: number;
  read: number;
  interested: Person[];
  unavailable: Person[];
  not_read: Person[];
};
type Cat = { id: string; name: string };

const TEMPLATES = [
  {
    label: "Preciso de carros",
    title: "Precisamos de veículos",
    body: "Precisamos de 3 veículos para um atendimento. Quem estiver disponível, toque em “Estou disponível” que a central entra em contato."
  },
  { label: "Recado geral", title: "Recado da central", body: "" }
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const wa = (p: string | null) => (p ? `https://wa.me/55${p.replace(/\D/g, "").replace(/^55/, "")}` : null);

export function DriverMessagesPanel() {
  const [list, setList] = useState<Msg[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [ask, setAsk] = useState(true);
  const [target, setTarget] = useState<string[]>([]);
  const [hours, setHours] = useState<number | "">(24);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/driver-messages", {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (j?.success) setList(j.data as Msg[]);
  }, []);
  useEffect(() => {
    void load();
    void fetchWithSupabaseSession("/api/vehicle-categories", {}, "admin")
      .then((r) => r.json())
      .then((j) => j?.success && setCats(((j.data ?? []) as Cat[]).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => undefined);
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function send() {
    if (busy) return;
    if (title.trim().length < 3 || body.trim().length < 3) {
      setMsg({ ok: false, text: "Escreva o título e a mensagem." });
      return;
    }
    const alvo = target.length ? `os motoristas de ${target.map((id) => cats.find((c) => c.id === id)?.name).join(", ")}` : "TODOS os motoristas ativos";
    if (!window.confirm(`Enviar este aviso para ${alvo}?\n\n${title}\n${body}`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetchWithSupabaseSession(
        "/api/driver-messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, contact_hint: contact || null, ask_interest: ask, target_category_ids: target, expires_hours: hours || null })
        },
        "admin"
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        setMsg({ ok: false, text: j?.error?.message ?? "Não foi enviado. Tente de novo." });
      } else {
        setMsg({ ok: true, text: `Enviado para ${j.data.targets} motorista(s). ${j.data.pushed} receberam o aviso no celular; os outros veem ao abrir o app.` });
        setTitle("");
        setBody("");
        setContact("");
        setOpen(j.data.id);
        void load();
      }
    } catch {
      setMsg({ ok: false, text: "Sem conexão. Tente de novo." });
    }
    setBusy(false);
  }

  async function close(id: string) {
    if (!window.confirm("Encerrar este aviso? Ele some do app dos motoristas.")) return;
    await fetchWithSupabaseSession(`/api/driver-messages/${id}`, { method: "PATCH" }, "admin").catch(() => null);
    void load();
  }

  const input = "w-full rounded-xl border border-prime-border bg-white px-3 py-2 text-sm";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className={`${PRIME_SURFACE_CARD} grid content-start gap-3`}>
        <h2 className="text-base font-semibold">Novo aviso</h2>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" onClick={() => { setTitle(t.title); setBody(t.body); }} className="rounded-full border border-prime-border px-3 py-1 text-xs hover:bg-prime-bg">
              {t.label}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-sm">
          Título
          <input className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Precisamos de 3 veículos sábado" />
        </label>
        <label className="grid gap-1 text-sm">
          Mensagem
          <textarea className={`${input} min-h-[120px]`} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="O que, quando, onde. Sem nome de cliente." />
        </label>
        <label className="grid gap-1 text-sm">
          Como falar com a central (opcional)
          <input className={input} value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} placeholder="Ex.: Falar com a Juliana · (27) 2142-8307" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} />
          Mostrar botões “Estou disponível” / “Não posso”
        </label>
        <div className="grid gap-1 text-sm">
          Quem recebe
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTarget([])} className={`rounded-full px-3 py-1 text-xs ${target.length ? "border border-prime-border" : "bg-[#111] text-[#fff]"}`}>
              Todos
            </button>
            {cats.map((c) => {
              const on = target.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => setTarget((t) => (on ? t.filter((x) => x !== c.id) : [...t, c.id]))} className={`rounded-full px-3 py-1 text-xs ${on ? "bg-[#111] text-[#fff]" : "border border-prime-border"}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <label className="grid gap-1 text-sm">
          Some do app depois de
          <select className={input} value={hours} onChange={(e) => setHours(e.target.value ? Number(e.target.value) : "")}>
            <option value={6}>6 horas</option>
            <option value={24}>1 dia</option>
            <option value={72}>3 dias</option>
            <option value={168}>7 dias</option>
            <option value="">Não some (eu encerro)</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void send()} className="rounded-xl bg-[#111] py-3 text-sm font-bold text-prime-gold disabled:opacity-60">
          {busy ? "Enviando…" : "Enviar para o app dos motoristas"}
        </button>
        {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
        <p className="text-xs text-prime-muted">Não coloque nome de cliente: o aviso aparece para todos os motoristas, inclusive parceiros.</p>
      </section>

      <section className="grid content-start gap-3">
        <h2 className="text-base font-semibold">Avisos enviados</h2>
        {list.length === 0 ? <p className="text-sm text-prime-muted">Nenhum aviso ainda.</p> : null}
        {list.map((m) => {
          const live = m.active && (!m.expires_at || Date.parse(m.expires_at) > Date.now());
          const isOpen = open === m.id;
          return (
            <article key={m.id} className={`${PRIME_SURFACE_CARD} grid gap-2`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{m.title}</p>
                  <p className="text-xs text-prime-muted">
                    {fmt(m.created_at)} · {live ? <span className="font-semibold text-emerald-700">no ar</span> : "encerrado"}
                    {m.expires_at && live ? ` até ${fmt(m.expires_at)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="rounded-full bg-prime-bg px-2 py-1">👁 {m.read}/{m.total} leram</span>
                  {m.ask_interest ? <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">🙋 {m.interested.length} disponíveis</span> : null}
                </div>
              </div>
              <p className="whitespace-pre-line text-sm">{m.body}</p>
              <div className="flex gap-3 text-xs">
                <button type="button" className="font-semibold text-prime-gold-ink" onClick={() => setOpen(isOpen ? null : m.id)}>
                  {isOpen ? "Esconder respostas" : "Ver respostas"}
                </button>
                {live ? (
                  <button type="button" className="text-red-700" onClick={() => void close(m.id)}>
                    Encerrar aviso
                  </button>
                ) : null}
              </div>
              {isOpen ? (
                <div className="grid gap-2 rounded-xl bg-prime-bg p-3 text-sm">
                  {m.ask_interest ? (
                    <div>
                      <p className="font-semibold text-emerald-800">Estão disponíveis ({m.interested.length})</p>
                      {m.interested.length === 0 ? <p className="text-xs text-prime-muted">Ninguém ainda.</p> : null}
                      {m.interested.map((p) => (
                        <p key={p.driver_id} className="flex items-center justify-between gap-2">
                          <span>{p.name}</span>
                          {wa(p.phone) ? (
                            <a href={wa(p.phone) as string} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">
                              Chamar no WhatsApp
                            </a>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {m.unavailable.length ? <p className="text-xs"><b>Não podem:</b> {m.unavailable.map((p) => p.name).join(", ")}</p> : null}
                  {m.not_read.length ? <p className="text-xs text-prime-muted"><b>Ainda não viram:</b> {m.not_read.map((p) => p.name).join(", ")}</p> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
