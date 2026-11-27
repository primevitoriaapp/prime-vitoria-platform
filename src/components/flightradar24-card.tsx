"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Colar a chave da API do Flightradar24 (fica guardado no banco; aqui só aparece o final). */
export function Flightradar24Card() {
  const [st, setSt] = useState<{ configured: boolean; tail: string | null } | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/integrations/flightradar24", {}, "admin")
      .then((r) => r.json())
      .then((j) => j?.success && setSt(j.data))
      .catch(() => undefined);
  }, []);
  async function save() {
    if (busy || token.trim().length < 20) return;
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession("/api/integrations/flightradar24", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setSt(j.data);
      setToken("");
      setMsg({ ok: true, text: "Chave salva e testada. O acompanhamento de voos já está ligado." });
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível salvar." });
  }
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Flightradar24 (acompanhamento de voos)</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st?.configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {st?.configured ? `Ligado · chave final ${st.tail}` : "Não ligado"}
        </span>
      </div>
      <p className="text-sm text-prime-muted">
        No site da API do Flightradar24: <b>Key management</b> › crie uma chave e cole aqui. Ela fica guardada no sistema e não aparece de novo.
        Com a chave, toda corrida com número de voo é acompanhada sozinha: o motorista recebe aviso quando o voo <b>decola</b>, <b>atrasa</b>, <b>não decola</b> e <b>pousa</b>.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={st?.configured ? "Colar uma chave nova para trocar" : "Cole a chave da API aqui"}
          className="min-w-[220px] flex-1 rounded-xl border border-prime-border px-3 py-2 text-sm"
        />
        <button type="button" disabled={busy || token.trim().length < 20} onClick={() => void save()} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-prime-gold disabled:opacity-50">
          {busy ? "Testando…" : "Salvar"}
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
    </section>
  );
}
