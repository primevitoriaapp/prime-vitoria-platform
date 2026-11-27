"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import type { HealthItem } from "@/lib/health/system-check";

type Run = { id: number; ran_at: string; trigger: string; problems: number; critical: number; items: HealthItem[]; notified: Record<string, unknown> };
type Cfg = { phone: string; email: string; whatsapp: boolean; send_email: boolean; push: boolean };

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const TRIG: Record<string, string> = { manha: "7h", tarde: "18h", manual: "manual", cron: "automática" };
const LEVEL = {
  critico: { dot: "bg-red-600", ring: "border-red-200 bg-red-50", tag: "Resolver hoje" },
  atencao: { dot: "bg-amber-500", ring: "border-amber-200 bg-amber-50", tag: "Atenção" },
  ok: { dot: "bg-emerald-500", ring: "border-prime-border bg-white", tag: "OK" }
} as const;

async function api<T>(url: string, init?: RequestInit) {
  const res = await fetchWithSupabaseSession(url, init ?? {}, "admin");
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string } };
  return { ok: res.ok && Boolean(json.success), data: json.data, error: json.error?.message };
}

export function SystemHealthPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ runs: Run[]; config: Cfg }>("/api/health");
    if (r.ok && r.data) {
      setRuns(r.data.runs);
      setCfg(r.data.config);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    setBusy(true);
    setMsg("");
    const r = await api("/api/health", { method: "POST" });
    setBusy(false);
    if (!r.ok) setMsg(r.error ?? "Não consegui checar agora.");
    await load();
  }

  async function saveCfg() {
    if (!cfg) return;
    setSaved("Salvando…");
    const r = await api<Cfg>("/api/health", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    setSaved(r.ok ? "✅ Salvo! Os alertas vão para esse número e e-mail." : `Não salvou: ${r.error ?? "tente de novo"}`);
  }

  const last = runs[0];
  const items = [...(last?.items ?? [])].sort((a, b) => ["critico", "atencao", "ok"].indexOf(a.level) - ["critico", "atencao", "ok"].indexOf(b.level));

  return (
    <div className="grid gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <div>
          {last ? (
            <>
              <p className="text-lg font-semibold">
                {last.problems === 0 ? "✅ Tudo certo" : last.critical ? `🔴 ${last.problems} ponto(s) de atenção, ${last.critical} urgente(s)` : `🟡 ${last.problems} ponto(s) de atenção`}
              </p>
              <p className="text-sm text-prime-muted">
                Última checagem: {fmt(last.ran_at)} ({TRIG[last.trigger] ?? last.trigger})
              </p>
            </>
          ) : (
            <p className="text-sm text-prime-muted">Ainda não rodou nenhuma checagem. Clique em “Checar agora”.</p>
          )}
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void runNow()}>
          {busy ? "Checando…" : "Checar agora"}
        </button>
      </section>
      {msg ? <p className="text-sm text-prime-muted">{msg}</p> : null}

      <section className="grid gap-2">
        {items.map((i) => {
          const L = LEVEL[i.level];
          return (
            <div key={i.key} className={`rounded-2xl border p-4 ${L.ring}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${L.dot}`} />
                  {i.title}
                  {i.level !== "ok" ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-prime-border">{L.tag}</span> : null}
                </p>
                {i.href && i.level !== "ok" ? (
                  <Link href={i.href as Route} className="text-sm font-semibold text-prime-gold-ink underline">
                    Resolver →
                  </Link>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-prime-text">{i.detail}</p>
              {i.samples?.length ? (
                <ul className="mt-2 grid gap-1 text-sm">
                  {i.samples.map((s, k) => (
                    <li key={k}>
                      {s.href ? (
                        <Link href={s.href as Route} className="underline">
                          {s.label}
                        </Link>
                      ) : (
                        s.label
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </section>

      {cfg ? (
        <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="font-semibold">🔔 Para onde vão os alertas</p>
          <p className="text-sm text-prime-muted">Às 7h avisa tudo que estiver pendente. Às 18h só o urgente (corrida de amanhã sem motorista ou automação parada). Se estiver tudo certo, não manda nada.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.whatsapp} onChange={(e) => setCfg({ ...cfg, whatsapp: e.target.checked })} /> WhatsApp
              </span>
              <input className={PRIME_INPUT_CLASS} inputMode="tel" placeholder="(27) 99999-9999" value={cfg.phone} onChange={(e) => {
                  setSaved("");
                  setCfg({ ...cfg, phone: e.target.value });
                }} />
              <span className="text-[12px] text-prime-muted">Seu celular. Funciona depois que a Meta aprovar o modelo “prime_central_alerta” (Integrações → WhatsApp).</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.send_email} onChange={(e) => setCfg({ ...cfg, send_email: e.target.checked })} /> E-mail
              </span>
              <input className={PRIME_INPUT_CLASS} inputMode="email" value={cfg.email} onChange={(e) => setCfg({ ...cfg, email: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.push} onChange={(e) => setCfg({ ...cfg, push: e.target.checked })} /> Notificação no painel (sino)
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={() => void saveCfg()}>
              Salvar alertas
            </button>
            {saved ? <span className="text-sm font-semibold text-emerald-700">{saved}</span> : null}
          </div>
        </section>
      ) : null}

      {runs.length > 1 ? (
        <section className="rounded-2xl border border-prime-border bg-white p-4 text-sm shadow-prime-card">
          <p className="mb-2 font-semibold">Últimas checagens</p>
          <ul className="grid gap-1">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {fmt(r.ran_at)} · {TRIG[r.trigger] ?? r.trigger}
                </span>
                <span className="text-prime-muted">
                  {r.problems === 0 ? "tudo certo" : `${r.problems} ponto(s)`}
                  {r.notified && Object.keys(r.notified).length ? ` · avisado: ${Object.entries(r.notified).map(([k, v]) => `${k} ${typeof v === "number" ? (v > 0 ? "ok" : "sem aparelho") : v}`).join(", ")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
