"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Mode = "desligado" | "teste" | "ligado";
type State = {
  mode: Mode;
  live: ("motoristas" | "passageiros")[];
  configured: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  token_tail: string | null;
  templates: { kind: string; audience: "passageiro" | "motorista"; name: string; label: string; when: string; preview: string }[];
  template_status: { name: string; status: string; category: string | null }[];
  log: { id: string; kind: string; phone: string; person_name: string | null; status: string; detail: string | null; preview: string | null; created_at: string }[];
};

const MODE_LABEL: Record<Mode, string> = {
  desligado: "Desligado — nada é enviado",
  teste: "Teste — registra os avisos; envia de verdade só para quem estiver marcado abaixo",
  ligado: "Ligado — envia de verdade"
};
const STATUS_PT: Record<string, string> = { APPROVED: "✅ Aprovado", PENDING: "⏳ Em análise", REJECTED: "❌ Recusado", PAUSED: "⏸ Pausado", "não enviado": "Ainda não enviado" };

/** WhatsApp oficial (Meta): avisos automáticos ao passageiro. */
export function WhatsappCloudCard() {
  const [st, setSt] = useState<State | null>(null);
  const [mode, setMode] = useState<Mode>("desligado");
  const [live, setLive] = useState<("motoristas" | "passageiros")[]>([]);
  const [phoneId, setPhoneId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession("/api/integrations/whatsapp-cloud/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: testPhone }) }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setMsg(r?.ok && j?.success ? { ok: true, text: `Enviado pelo ${j.data.provider}. Confira o WhatsApp desse número.` } : { ok: false, text: j?.error?.message ?? "Não foi possível enviar." });
  }

  async function load() {
    const r = await fetchWithSupabaseSession("/api/integrations/whatsapp-cloud", {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (j?.success) {
      setSt(j.data);
      setMode(j.data.mode);
      setLive(j.data.live ?? []);
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
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, live, phone_number_id: phoneId.trim(), waba_id: wabaId.trim(), ...(token.trim() ? { token: token.trim() } : {}) }) },
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
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">WhatsApp oficial · avisos a passageiros e motoristas</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st?.mode === "ligado" ? "bg-emerald-50 text-emerald-800" : st?.mode === "teste" ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-700"}`}>
          {st ? (st.mode === "ligado" ? "Ligado" : st.mode === "teste" ? "Modo teste" : "Desligado") : "…"}
        </span>
      </div>
      <p className="text-sm text-prime-muted">
        Só 3 avisos por corrida, pelo número oficial da Prime: <b>motorista confirmado</b> (véspera, 18h), <b>a caminho</b> (com link para acompanhar) e <b>avaliação</b> (no fim; no máximo 1 por semana
        para a mesma pessoa). <b>Passageiro recorrente</b> (ex.: rota diária) só recebe a confirmação quando o motorista muda, e a avaliação no máximo 1 vez por mês. Cada empresa cliente pode ser desligada no cadastro dela.
        <br />
        <b>Motorista</b> recebe: nova corrida, corrida alterada e corrida cancelada/retirada (sem valores e sem nome da empresa cliente), com botão que abre a corrida no app.
      </p>

      <div className="grid gap-2">
        <p className="text-sm font-semibold">Mensagens (é o texto que vai para aprovação da Meta)</p>
        {(st?.templates ?? []).map((t) => (
          <div key={t.name} className="rounded-xl border border-prime-border">
            <button type="button" onClick={() => setOpen(open === t.name ? null : t.name)} className="grid w-full min-w-0 gap-1 px-3 py-2 text-left text-sm">
              <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-semibold">
                  {t.audience === "motorista" ? "🚘 " : "👤 "}
                  {t.label}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    statusOf(t.name)?.status === "APPROVED"
                      ? "bg-emerald-50 text-emerald-800"
                      : statusOf(t.name)?.status === "REJECTED"
                        ? "bg-red-50 text-red-800"
                        : statusOf(t.name)?.status === "PENDING"
                          ? "bg-amber-50 text-amber-900"
                          : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {STATUS_PT[statusOf(t.name)?.status ?? "não enviado"] ?? statusOf(t.name)?.status}
                </span>
              </span>
              <span className="text-xs text-prime-muted">
                {t.when}
                {statusOf(t.name)?.category && statusOf(t.name)?.category !== "UTILITY" ? ` · Meta classificou como ${statusOf(t.name)?.category} (mais caro)` : ""}
              </span>
            </button>
            {open === t.name ? <pre className="whitespace-pre-wrap break-words border-t border-prime-border bg-[#ECE5DD] px-3 py-3 font-sans text-sm text-[#111]">{t.preview}</pre> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">ID do número (Phone number ID)</span>
          <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} inputMode="numeric" className="w-full min-w-0 rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm" placeholder="Só números" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">ID da conta WhatsApp (WABA ID)</span>
          <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} inputMode="numeric" className="w-full min-w-0 rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm" placeholder="Só números" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Chave de acesso (Dualhook: começa com dh_live_)</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="w-full min-w-0 rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm" placeholder={st?.token_tail ? `Guardada (final ${st.token_tail}) — cole outra para trocar` : "Cole aqui (fica guardada)"} />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Situação</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="w-full min-w-0 rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {mode === "teste" ? (
        <div className="grid gap-1 rounded-xl bg-prime-bg p-3 text-sm">
          <span className="font-semibold">Já enviar de verdade para:</span>
          {(["motoristas", "passageiros"] as const).map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" checked={live.includes(a)} onChange={(e) => setLive(e.target.checked ? [...new Set([...live, a])] : live.filter((x) => x !== a))} />
              <span>{a === "motoristas" ? "Motoristas" : "Passageiros"}</span>
            </label>
          ))}
          <span className="text-xs text-prime-muted">Só funciona depois que a Meta aprovar a mensagem e houver forma de pagamento cadastrada na conta do WhatsApp.</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#111] px-4 py-2.5 text-sm font-bold text-prime-gold disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" disabled={busy || !st?.configured || !st?.waba_id} onClick={() => void submitTemplates()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold ring-1 ring-prime-border disabled:opacity-40">
          Enviar as mensagens para aprovação da Meta
        </button>
      </div>
      <div className="grid gap-2 rounded-xl bg-prime-bg p-3 text-sm">
        <span className="font-semibold">Testar a conexão (envia 1 mensagem real, mesmo em modo teste)</span>
        <span className="text-xs text-prime-muted">Antes, mande qualquer mensagem desse número para a central. Depois digite o número aqui.</span>
        <div className="flex flex-wrap gap-2">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="tel" placeholder="(27) 99999-9999" className="min-w-0 flex-1 rounded-xl border border-prime-border bg-white px-3 py-2 text-base sm:text-sm" />
          <button type="button" disabled={busy || testPhone.replace(/\D/g, "").length < 10} onClick={() => void sendTest()} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-40">
            Enviar teste
          </button>
        </div>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}

      <a href="/whatsapp?aba=avisos" className="text-sm font-semibold text-prime-gold-ink">
        Ver o histórico de avisos (passageiros e motoristas) →
      </a>
    </section>
  );
}
