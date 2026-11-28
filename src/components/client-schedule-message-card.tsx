"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type ClientOpt = { id: string; name: string; trade_name?: string | null; active?: boolean };
type PaxOpt = { passenger: string; client_id: string; client_name: string; count: number; next: string | null };
type Result = { client_name: string; count: number; without_driver: number; text: string; phone: string | null; whatsapp_url: string | null };

function spDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Agenda: escolhe o cliente e o dia, e sai a mensagem pronta com as corridas para copiar ou abrir no WhatsApp. */
export function ClientScheduleMessageCard() {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [pax, setPax] = useState<PaxOpt | null>(null);
  const [paxOpts, setPaxOpts] = useState<PaxOpt[]>([]);
  const [preset, setPreset] = useState<"ontem" | "hoje" | "amanha" | "7d" | "dia">("hoje");
  const [day, setDay] = useState(spDate(0));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchWithSupabaseSession("/api/clients", {}, "admin")
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: ClientOpt[] }) => setClients((j.data ?? []).filter((c) => c.active !== false)))
      .catch(() => setClients([]));
  }, []);

  const range = useMemo(() => {
    if (preset === "ontem") return { from: spDate(-1), to: spDate(-1) };
    if (preset === "hoje") return { from: spDate(0), to: spDate(0) };
    if (preset === "amanha") return { from: spDate(1), to: spDate(1) };
    if (preset === "7d") return { from: spDate(0), to: spDate(6) };
    return { from: day, to: day };
  }, [preset, day]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? clients.filter((c) => `${c.trade_name ?? ""} ${c.name}`.toLowerCase().includes(q)) : clients;
    return list.slice(0, 8);
  }, [clients, query]);

  // Também procura pelo nome do passageiro (quem não é cliente direto, ex.: músico da orquestra).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || clientId) {
      setPaxOpts([]);
      return;
    }
    const id = window.setTimeout(() => {
      void fetchWithSupabaseSession(`/api/trips/passenger-search?q=${encodeURIComponent(q)}`, {}, "admin")
        .then((r) => r.json())
        .then((j: { success?: boolean; data?: { items?: PaxOpt[] } }) => setPaxOpts(j.data?.items ?? []))
        .catch(() => setPaxOpts([]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [query, clientId]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void fetchWithSupabaseSession(`/api/clients/${clientId}/schedule-message?from=${range.from}&to=${range.to}${pax ? `&passenger=${encodeURIComponent(pax.passenger)}` : ""}`, {}, "admin")
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Result; error?: { message?: string } }) => {
        if (cancelled) return;
        if (!j.success || !j.data) {
          setError(j.error?.message ?? "Não foi possível montar a mensagem.");
          setRes(null);
          setText("");
        } else {
          setRes(j.data);
          setText(j.data.text);
        }
      })
      .catch(() => !cancelled && setError("Sem conexão. Tente de novo."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [clientId, range, pax]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const waUrl = res?.phone && text ? `https://wa.me/${res.phone.replace(/\D/g, "").replace(/^(?!55)/, "55")}?text=${encodeURIComponent(text)}` : null;
  const selected = clients.find((c) => c.id === clientId);

  return (
    <details className="mb-6 rounded-2xl border border-prime-border bg-white shadow-prime-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold">📲 Enviar agenda ao cliente</span>
          <span className="text-xs text-prime-muted">Mensagem pronta com os carros agendados: copiar ou abrir no WhatsApp.</span>
        </span>
        <span className="text-prime-muted">▾</span>
      </summary>
      <div className="grid gap-3 border-t border-prime-border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative grid gap-1 text-sm">
            <span>Cliente ou passageiro</span>
            <input
              className={PRIME_INPUT_CLASS}
              placeholder="Nome do cliente ou do passageiro"
              autoComplete="off"
              name="prime-schedule-search"
              value={pax && !query ? `${pax.passenger} · ${pax.client_name}` : selected && !query ? selected.trade_name || selected.name : query}
              onChange={(e) => {
                setQuery(e.target.value);
                setClientId("");
                setPax(null);
                setRes(null);
              }}
            />
            {!clientId && query.trim() && (filtered.length || paxOpts.length) ? (
              <ul className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-prime-border bg-white shadow-lg">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-prime-bg"
                      onClick={() => {
                        setClientId(c.id);
                        setQuery("");
                      }}
                    >
                      {c.trade_name || c.name}
                      {c.trade_name && c.trade_name !== c.name ? <span className="text-xs text-prime-muted"> · {c.name}</span> : null}
                    </button>
                  </li>
                ))}
                {paxOpts.length ? <li className="bg-prime-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-prime-muted">Passageiros</li> : null}
                {paxOpts.map((p) => (
                  <li key={`${p.passenger}|${p.client_id}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-prime-bg"
                      onClick={() => {
                        setPax(p);
                        setClientId(p.client_id);
                        setQuery("");
                        if (p.next) {
                          const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(p.next));
                          if (d !== spDate(0)) {
                            setPreset(d === spDate(1) ? "amanha" : "dia");
                            setDay(d);
                          }
                        }
                      }}
                    >
                      👤 {p.passenger} <span className="text-xs text-prime-muted">· {p.client_name} · {p.count} corrida{p.count > 1 ? "s" : ""}{p.next ? ` · próxima ${new Date(p.next).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          <div className="grid gap-1 text-sm">
            <span>Período</span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["ontem", "Ontem"],
                  ["hoje", "Hoje"],
                  ["amanha", "Amanhã"],
                  ["7d", "Próx. 7 dias"],
                  ["dia", "Outro dia"]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreset(id)}
                  className={`rounded-lg px-3 py-2 text-sm ring-1 ${preset === id ? "bg-[#111] text-[#fff] ring-[#111]" : "ring-prime-border"}`}
                >
                  {label}
                </button>
              ))}
              {preset === "dia" ? <input type="date" className={`${PRIME_INPUT_CLASS} w-auto`} value={day} onChange={(e) => setDay(e.target.value)} /> : null}
            </div>
          </div>
        </div>

        {busy ? <p className="text-sm text-prime-muted">Montando a mensagem…</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {res && !busy ? (
          res.count === 0 ? (
            <p className="rounded-lg bg-prime-bg p-3 text-sm">
              Nenhuma corrida de {res.client_name} neste período. Se você acabou de agendar, confira a <b>data</b> da corrida (use “Outro dia” para escolher o dia certo).
            </p>
          ) : (
            <>
              {res.without_driver > 0 ? (
                <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                  {res.without_driver} corrida(s) ainda sem motorista: na mensagem aparecem como “a confirmar”. Se preferir, defina o motorista antes de enviar.
                </p>
              ) : null}
              <label className="grid gap-1 text-sm">
                <span>Mensagem ({res.count} corrida{res.count > 1 ? "s" : ""}) — pode editar antes de enviar</span>
                <textarea className={`${PRIME_INPUT_CLASS} min-h-[260px] font-mono text-[13px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void copy()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C]">
                  {copied ? "✓ Copiada" : "Copiar mensagem"}
                </button>
                {waUrl ? (
                  <a href={waUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#fff]">
                    {pax ? "Abrir no WhatsApp do passageiro" : "Abrir no WhatsApp do cliente"}
                  </a>
                ) : (
                  <span className="text-xs text-prime-muted">{pax ? "Passageiro sem celular na corrida" : "Cliente sem WhatsApp no cadastro"}: copie e cole na conversa.</span>
                )}
              </div>
            </>
          )
        ) : null}
      </div>
    </details>
  );
}
