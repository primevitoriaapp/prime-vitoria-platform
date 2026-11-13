"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Mode = "desligado" | "teste" | "ligado";
type State = {
  mode: Mode;
  configured: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  token_tail: string | null;
  templates: { kind: string; name: string; label: string; when: string; preview: string }[];
  template_status: { name: string; status: string; category: string | null }[];
  log: { id: string; kind: string; phone: string; person_name: string | null; status: string; detail: string | null; preview: string | null; created_at: string }[];
};

const MODE_LABEL: Record<Mode, string> = {
  desligado: "Desligado — nada é enviado",
  teste: "Teste — monta e registra cada aviso aqui embaixo, sem enviar",
  ligado: "Ligado — envia de verdade"
};
const STATUS_PT: Record<string, string> = { APPROVED: "✅ Aprovado", PENDING: "⏳ Em análise", REJECTED: "❌ Recusado", PAUSED: "⏸ Pausado", "não enviado": "Ainda não enviado" };
const KIND_PT: Record<string, string> = { confirmado: "Confirmado", a_caminho: "A caminho", avaliacao: "Avaliação" };

/** WhatsApp oficial (Meta): avisos automáticos ao passageiro. */
export function WhatsappCloudCard() {
  const [st, setSt] = useState<State | null>(null);
  const [mode, setMode] = useState<Mode>("desligado");
  const [phoneId, setPhoneId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const r = await fetchWithSupabaseSession("/api/integrations/whatsapp-cloud", {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (j?.success) {
      setSt(j.data);
      setMode(j.data.mode);
      setPhoneId(j.data.phone_number_id ?? "");
      setWabaId(j.data.waba_id ?? "");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      "/api/integrations/whatsapp-cloud",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, phone_number_id: phoneId.trim(), waba_id: wabaId.trim(), ...(token.trim() ? { token: token.trim() } : {}) }) },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setToken("");
      setMsg({ ok: true, text: "Salvo." });
      void load();
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível salvar." });
  }

  async function submitTemplates() {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession("/api/integrations/whatsapp-cloud", { method: "POST" }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      const res = j.data.results as { name: string; ok: boolean; detail: string }[];
      setMsg({ ok: res.every((x) => x.ok), text: res.map((x) => `${x.name}: ${x.ok ? "enviado para análise" : x.detail}`).join(" · ") });
      void load();
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível enviar." });
  }

  const statusOf = (name: string) => st?.template_status.find((s) => s.name === name);

  return (
    <section className="grid gap-4 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">WhatsApp oficial · avisos ao passageiro</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st?.mode === "ligado" ? "bg-emerald-50 text-emerald-800" : st?.mode === "teste" ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-700"}`}>
          {st ? (st.mode === "ligado" ? "Ligado" : st.mode === "teste" ? "Modo teste" : "Desligado") : "…"}
        </span>
      </div>
      <p className="text-sm text-prime-muted">
        Só 3 avisos por corrida, pelo número oficial da Prime: <b>motorista confirmado</b> (véspera, 18h), <b>a caminho</b> (com link para acompanhar) e <b>avaliação</b> (no fim; no máximo 1 por semana
        para a mesma pessoa). Cada empresa cliente pode ser desligada no cadastro dela.
      </p>

      <div className="grid gap-2">
        <p className="text-sm font-semibold">Mensagens (é o texto que vai para aprovação da Meta)</p>
        {(st?.templates ?? []).map((t) => (
          <div key={t.name} className="rounded-xl border border-prime-border">
            <button type="button" onClick={() => setOpen(open === t.name ? null : t.name)} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm">
              <span className="font-semibold">{t.label}</span>
              <span className="text-xs text-prime-muted">
                {t.when} · {STATUS_PT[statusOf(t.name)?.status ?? "não enviado"] ?? statusOf(t.name)?.status}
                {statusOf(t.name)?.category && statusOf(t.name)?.category !== "UTILITY" ? ` · Meta classificou como ${statusOf(t.name)?.category} (mais caro)` : ""}
              </span>
            </button>
            {open === t.name ? <pre className="whitespace-pre-wrap border-t border-prime-border bg-[#ECE5DD] px-3 py-3 font-sans text-sm text-[#111]">{t.preview}</pre> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">ID do número (Phone number ID)</span>
          <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} inputMode="numeric" className="rounded-xl border border-prime-border px-3 py-2 text-sm" placeholder="Só números" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">ID da conta WhatsApp (WABA ID)</span>
          <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} inputMode="numeric" className="rounded-xl border border-prime-border px-3 py-2 text-sm" placeholder="Só números" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Chave de acesso permanente</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="rounded-xl border border-prime-border px-3 py-2 text-sm" placeholder={st?.token_tail ? `Guardada (final ${st.token_tail}) — cole outra para trocar` : "Cole aqui (fica guardada)"} />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Situação</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="rounded-xl border border-prime-border px-3 py-2 text-sm">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#111] px-4 py-2.5 text-sm font-bold text-prime-gold disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" disabled={busy || !st?.configured || !st?.waba_id} onClick={() => void submitTemplates()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold ring-1 ring-prime-border disabled:opacity-40">
          Enviar as 3 mensagens para aprovação da Meta
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}

      <div className="grid gap-1">
        <p className="text-sm font-semibold">Últimos avisos {st?.mode === "teste" ? "(modo teste: nada foi enviado)" : ""}</p>
        {st?.log.length ? (
          <ul className="divide-y divide-prime-border rounded-xl border border-prime-border text-sm">
            {st.log.map((l) => (
              <li key={l.id} className="px-3 py-2">
                <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="flex w-full flex-wrap justify-between gap-2 text-left">
                  <span>
                    <b>{KIND_PT[l.kind] ?? l.kind}</b> · {l.person_name ?? "Passageiro"} · {l.phone}
                  </span>
                  <span className="text-xs text-prime-muted">
                    {l.status}
                    {l.detail ? ` — ${l.detail}` : ""} · {new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
                {open === l.id && l.preview ? <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-[#ECE5DD] px-3 py-2 font-sans text-sm">{l.preview}</pre> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-prime-muted">Nenhum aviso ainda. No modo teste, cada corrida passa a aparecer aqui com o texto exato que o passageiro receberia.</p>
        )}
      </div>
    </section>
  );
}
