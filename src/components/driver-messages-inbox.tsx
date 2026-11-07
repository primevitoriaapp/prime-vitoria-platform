"use client";

import { useCallback, useEffect, useState } from "react";

type M = {
  id: string;
  title: string;
  body: string;
  contact_hint: string | null;
  ask_interest: boolean;
  created_at: string;
  live: boolean;
  read_at: string | null;
  answer: "interessado" | "indisponivel" | null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function act(id: string, action: "read" | "interessado" | "indisponivel") {
  const r = await fetch(`/api/drivers/me/messages/${id}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return { ok: Boolean(r?.ok && j?.success), message: (j?.error?.message as string | undefined) ?? null };
}

/** Recado novo da central: abre por cima do app até o motorista responder ou tocar em "Entendi". */
export function DriverMessagePopup() {
  const [queue, setQueue] = useState<M[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/drivers/me/messages", { credentials: "include" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (j?.success) setQueue(((j.data ?? []) as M[]).filter((m) => m.live && !m.read_at).reverse());
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const m = queue[0];
  if (!m) return null;

  async function answer(action: "read" | "interessado" | "indisponivel") {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await act(m.id, action);
    setBusy(false);
    if (!r.ok && action !== "read") {
      setErr(r.message ?? "Não foi enviado. Confira a internet e toque de novo.");
      if (r.message?.includes("encerrado")) setQueue((q) => q.slice(1));
      return;
    }
    setQueue((q) => q.slice(1));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Aviso da central">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-[#111] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-prime-gold">📣 Aviso da central</p>
          <p className="mt-1 text-xl font-bold" style={{ color: "#fff" }}>
            {m.title}
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
            {fmt(m.created_at)}
          </p>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#111]">{m.body}</p>
          {m.contact_hint ? <p className="rounded-xl bg-[#FBF7EC] px-3 py-2 text-sm text-[#5A4A1A]">📞 {m.contact_hint}</p> : null}
          {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p> : null}
          {m.ask_interest ? (
            <div className="grid gap-2">
              <button type="button" disabled={busy} onClick={() => void answer("interessado")} className="rounded-2xl bg-emerald-600 py-4 text-base font-bold text-[#fff] disabled:opacity-60">
                🙋 Estou disponível
              </button>
              <button type="button" disabled={busy} onClick={() => void answer("indisponivel")} className="rounded-2xl border border-[#DDD5C2] py-3 text-sm font-semibold text-[#111] disabled:opacity-60">
                Não posso desta vez
              </button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => void answer("read")} className="rounded-2xl bg-[#111] py-4 text-base font-bold text-prime-gold disabled:opacity-60">
              Entendi
            </button>
          )}
          {queue.length > 1 ? <p className="text-center text-xs text-[#6B6F76]">Mais {queue.length - 1} aviso(s) depois deste</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Lista dos avisos (aba Perfil), para reler. */
export function DriverMessagesList() {
  const [list, setList] = useState<M[]>([]);
  const load = useCallback(async () => {
    const r = await fetch("/api/drivers/me/messages", { credentials: "include" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (j?.success) setList(j.data as M[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!list.length) return null;
  return (
    <section className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <h3 className="text-base font-semibold">Avisos da central</h3>
      <div className="mt-2 grid gap-3">
        {list.slice(0, 10).map((m) => (
          <div key={m.id} className="border-t border-[#EEE] pt-3 first:border-0 first:pt-0">
            <p className="text-sm font-semibold">{m.title}</p>
            <p className="text-xs text-[#6B6F76]">
              {fmt(m.created_at)}
              {m.answer === "interessado" ? " · você disse que está disponível" : m.answer === "indisponivel" ? " · você disse que não pode" : ""}
              {!m.live ? " · encerrado" : ""}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
            {m.live && m.ask_interest && m.answer !== "interessado" ? (
              <button
                type="button"
                className="mt-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-[#fff]"
                onClick={async () => {
                  await act(m.id, "interessado");
                  void load();
                }}
              >
                🙋 Estou disponível
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
