"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** InfiniteTag + chave da API da InfinitePay (a chave fica guardada; aqui só aparece o final). */
export function InfinitepayCard() {
  const [st, setSt] = useState<{ handle: string | null; configured: boolean; key_tail: string | null } | null>(null);
  const [handle, setHandle] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/integrations/infinitepay", {}, "admin")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setSt(j.data);
          setHandle(j.data.handle ?? "");
        }
      })
      .catch(() => undefined);
  }, []);
  async function save() {
    if (busy || handle.trim().length < 2) return;
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      "/api/integrations/infinitepay",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: handle.trim(), ...(key.trim() ? { api_key: key.trim() } : {}) }) },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setSt(j.data);
      setKey("");
      setMsg({ ok: true, text: "InfinitePay conectada. Os links já podem ser gerados no orçamento e na corrida." });
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível salvar." });
  }
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">InfinitePay (links de pagamento)</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st?.configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {st?.configured ? `Conectada · $${st.handle} · chave final ${st.key_tail}` : "Não conectada"}
        </span>
      </div>
      <p className="text-sm text-prime-muted">
        1) Sua <b>InfiniteTag</b> (o @ da conta, sem o $). 2) Na InfinitePay, crie uma <b>chave de API do Checkout</b> (começa com <b>inchk_</b>) e cole aqui. Ela fica guardada no
        sistema e não aparece de novo.
      </p>
      <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="InfiniteTag" autoComplete="off" className="rounded-xl border border-prime-border px-3 py-2 text-sm" />
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={st?.configured ? "Colar uma chave nova para trocar" : "Cole a chave da API (inchk_…)"}
          className="rounded-xl border border-prime-border px-3 py-2 text-sm"
        />
        <button type="button" disabled={busy || handle.trim().length < 2} onClick={() => void save()} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-prime-gold disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
    </section>
  );
}
