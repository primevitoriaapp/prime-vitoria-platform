"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Colar o token da ZapSign (fica guardado no banco; aqui só aparece o final). */
export function ZapsignTokenCard() {
  const [st, setSt] = useState<{ configured: boolean; tail: string | null } | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/integrations/zapsign", {}, "admin")
      .then((r) => r.json())
      .then((j) => j?.success && setSt(j.data))
      .catch(() => undefined);
  }, []);
  async function save() {
    if (busy || token.trim().length < 10) return;
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession("/api/integrations/zapsign", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setSt(j.data);
      setToken("");
      setMsg({ ok: true, text: "Token salvo e testado com a ZapSign." });
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível salvar." });
  }
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">ZapSign (assinatura de contratos)</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st?.configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {st?.configured ? `Conectada · token final ${st.tail}` : "Não conectada"}
        </span>
      </div>
      <p className="text-sm text-prime-muted">
        Na ZapSign: <b>Configurações › Integração › API</b>, copie o <b>token da API</b> e cole aqui. Ele fica guardado no sistema e não aparece de novo.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={st?.configured ? "Colar um token novo para trocar" : "Cole o token da API aqui"}
          className="min-w-[220px] flex-1 rounded-xl border border-prime-border px-3 py-2 text-sm"
        />
        <button type="button" disabled={busy || token.trim().length < 10} onClick={() => void save()} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-prime-gold disabled:opacity-50">
          {busy ? "Testando…" : "Salvar"}
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
    </section>
  );
}
