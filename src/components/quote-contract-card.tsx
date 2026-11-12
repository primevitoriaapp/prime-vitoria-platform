"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Contract = { id: string; title: string; status: "pendente" | "assinado" | "recusado" | "cancelado"; sign_url: string | null; created_at: string; signed_at: string | null };
type Field = { variable: string; value: string };
type Data = {
  connected: boolean;
  contracts: Contract[];
  templates: { token: string; name: string }[];
  template: { token: string; name: string } | null;
  fields: Field[];
  signer: { name: string; email: string | null; phone: string | null } | null;
  quote_status?: string | null;
};

const ST: Record<Contract["status"], [string, string]> = {
  pendente: ["Aguardando assinatura", "bg-amber-50 text-amber-900"],
  assinado: ["✓ Assinado", "bg-emerald-50 text-emerald-800"],
  recusado: ["Recusado", "bg-red-50 text-red-700"],
  cancelado: ["Cancelado", "bg-gray-100 text-gray-600"]
};
const label = (v: string) => v.replace(/[{}]/g, "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * Contrato do orçamento (pessoa física, casamento, eventos de empresas de fora):
 * dados vêm do orçamento, a central confere, envia para assinar na ZapSign.
 * Assinou + sinal pago → orçamento aprovado sozinho e corridas na agenda.
 */
export function QuoteContractCard({ quoteId }: { quoteId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [signer, setSigner] = useState({ name: "", email: "", phone: "" });
  const [tpl, setTpl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (template?: string) => {
      const r = await fetchWithSupabaseSession(`/api/quotes/${quoteId}/contract${template ? `?template=${template}` : ""}`, {}, "admin").catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!j?.success) {
        setD({ connected: false, contracts: [], templates: [], template: null, fields: [], signer: null });
        return;
      }
      const data = j.data as Data;
      setD(data);
      setFields(data.fields);
      setTpl(data.template?.token ?? "");
      if (data.signer) setSigner({ name: data.signer.name ?? "", email: data.signer.email ?? "", phone: data.signer.phone ?? "" });
    },
    [quoteId]
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!tpl) return setMsg({ ok: false, text: "Escolha o modelo do contrato." });
    if (!signer.name.trim() || (!signer.email.trim() && !signer.phone.trim())) return setMsg({ ok: false, text: "Informe o nome e o e-mail ou WhatsApp de quem assina." });
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      `/api/quotes/${quoteId}/contract`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template_id: tpl, fields, signer: { name: signer.name, email: signer.email || null, phone: signer.phone || null } }) },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok || !j?.success) return setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível gerar o contrato." });
    setOpen(false);
    setMsg({ ok: true, text: "Contrato criado na ZapSign. Copie o link e mande para o cliente assinar." });
    await load();
  }

  async function copy(c: Contract) {
    if (!c.sign_url) return;
    try {
      await navigator.clipboard.writeText(c.sign_url);
      setCopied(c.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copie o link:", c.sign_url);
    }
  }

  if (!d) return null;
  const live = d.contracts.filter((c) => c.status !== "cancelado");
  const signed = live.some((c) => c.status === "assinado");
  const empty = fields.filter((f) => !f.value.trim()).length;

  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">📝 Contrato (pessoa física, casamento, eventos)</h3>
        {d.quote_status === "aprovado" ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Serviço confirmado ✓</span> : null}
      </div>
      <p className="text-xs text-prime-muted">
        O serviço é confirmado sozinho quando o <b>contrato está assinado</b> e o <b>sinal está pago</b> (link de pagamento acima). Aí as corridas entram na agenda.
      </p>
      {!d.connected ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ZapSign não conectada. Em <a href="/integracoes" className="font-semibold underline">Integrações</a>, cole o token da ZapSign.
        </p>
      ) : null}

      {live.length ? (
        <ul className="divide-y divide-prime-border rounded-xl border border-prime-border">
          {live.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.title}</span>
                <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ST[c.status][1]}`}>
                  {ST[c.status][0]}
                  {c.signed_at ? ` em ${new Date(c.signed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                </span>
              </span>
              {c.status === "pendente" && c.sign_url ? (
                <span className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void copy(c)} className="rounded-lg bg-[#111] px-3 py-1 text-xs font-semibold text-prime-gold">
                    {copied === c.id ? "✓ Copiado" : "Copiar link"}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Segue o contrato do seu serviço com a Prime Vitória para assinatura digital: ${c.sign_url}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg px-3 py-1 text-xs font-semibold ring-1 ring-prime-border"
                  >
                    WhatsApp
                  </a>
                  <button type="button" onClick={() => void load(tpl)} className="rounded-lg px-3 py-1 text-xs ring-1 ring-prime-border">
                    Atualizar situação
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {d.connected && !signed ? (
        open ? (
          <div className="grid gap-3 rounded-xl bg-prime-bg p-3">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Modelo</span>
              <select
                className="rounded-lg border border-prime-border bg-white px-2 py-2 text-sm"
                value={tpl}
                onChange={(e) => {
                  setTpl(e.target.value);
                  void load(e.target.value);
                }}
              >
                <option value="">Escolha o modelo da ZapSign…</option>
                {d.templates.map((t) => (
                  <option key={t.token} value={t.token}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["name", "Quem assina *"],
                  ["email", "E-mail"],
                  ["phone", "WhatsApp"]
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="grid gap-1 text-sm">
                  <span>{l}</span>
                  <input className="rounded-lg border border-prime-border bg-white px-2 py-2 text-sm" value={signer[k]} onChange={(e) => setSigner({ ...signer, [k]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                </label>
              ))}
            </div>
            {fields.length ? (
              <details open={empty > 0} className="rounded-lg bg-white p-2 ring-1 ring-prime-border">
                <summary className="cursor-pointer text-sm font-semibold">
                  Conferir os dados do contrato ({fields.length} campos{empty ? ` · ${empty} em branco` : " · todos preenchidos"})
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {fields.map((f, i) => (
                    <label key={f.variable} className="grid gap-0.5 text-xs">
                      <span className={f.value.trim() ? "text-prime-muted" : "font-semibold text-amber-700"}>{label(f.variable)}</span>
                      <input
                        className="rounded-md border border-prime-border px-2 py-1.5 text-sm"
                        value={f.value}
                        onChange={(e) => setFields((l) => l.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))}
                        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-prime-muted">Campos em branco que não se aplicam (ex.: transfer 4 a 6, testemunha) podem ficar vazios.</p>
              </details>
            ) : tpl ? (
              <p className="text-xs text-prime-muted">Esse modelo não tem campos {"{{ }}"} para preencher.</p>
            ) : null}
            <div className="flex gap-2">
              <button type="button" disabled={busy || !tpl} onClick={() => void send()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-50">
                {busy ? "Gerando…" : "Gerar e enviar para assinatura"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="justify-self-start rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-prime-gold">
            + Gerar contrato
          </button>
        )
      ) : null}
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
