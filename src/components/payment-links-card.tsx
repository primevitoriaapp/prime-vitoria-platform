"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Link = {
  id: string;
  kind: "sinal" | "saldo" | "total" | "outro";
  description: string;
  amount: number;
  assured_installments: number | null;
  url: string | null;
  status: "aberto" | "pago" | "cancelado" | "estornado";
  paid_amount: number | null;
  installments: number | null;
  capture_method: string | null;
  receipt_url: string | null;
  paid_at: string | null;
  booking_payment_id: string | null;
  created_at: string;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const KIND: Record<Link["kind"], string> = { sinal: "Sinal", saldo: "Saldo", total: "Valor total", outro: "Outro valor" };
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const parseMoney = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");

/**
 * Link de pagamento da InfinitePay ligado ao orçamento ou à corrida.
 * Quando o cliente paga, o sistema confere e lança sozinho como "pagamento recebido".
 */
export function PaymentLinksCard({ quoteId, tripId, total }: { quoteId?: string; tripId?: string; total: number }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [connected, setConnected] = useState(true);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Link["kind"]>("sinal");
  const [amount, setAmount] = useState("");
  const [assured, setAssured] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const qs = quoteId ? `quote_id=${quoteId}` : `trip_id=${tripId}`;
  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/payment-links?${qs}`, {}, "admin").catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: { connected: boolean; links: Link[] } }) : {};
    if (j.success && j.data) {
      setLinks(j.data.links);
      setConnected(j.data.connected);
    } else setLinks([]);
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = (links ?? []).filter((l) => l.status !== "cancelado");
  const paid = live.filter((l) => l.status === "pago").reduce((n, l) => n + l.amount, 0);
  const pending = live.filter((l) => l.status === "aberto").reduce((n, l) => n + l.amount, 0);
  const rest = Math.max(0, Math.round((total - paid - pending) * 100) / 100);

  function pickKind(k: Link["kind"]) {
    setKind(k);
    if (k === "sinal") setAmount(money(total / 2));
    else if (k === "saldo") setAmount(money(rest || total - paid));
    else if (k === "total") setAmount(money(total));
    else setAmount("");
  }

  function startNew() {
    setMsg(null);
    setOpen(true);
    pickKind(paid > 0 ? "saldo" : "sinal");
  }

  async function create() {
    const value = parseMoney(amount);
    if (value < 1) return setMsg({ ok: false, text: "Digite o valor do link." });
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      "/api/payment-links",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(quoteId ? { quote_id: quoteId } : { trip_id: tripId }), kind, amount: value, assured_installments: assured }) },
      "admin"
    ).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: Link; error?: { message?: string } }) : {};
    setBusy(false);
    if (!r?.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível gerar o link." });
    setOpen(false);
    setMsg({ ok: true, text: "Link gerado. Copie e mande para o cliente." });
    await load();
  }

  async function act(id: string, action: "pago_manual" | "cancelar") {
    const q =
      action === "cancelar"
        ? "Tirar este link da lista? Na InfinitePay ele continua existindo — não mande mais para o cliente."
        : "Confirmar que este link foi pago? Confira antes no app da InfinitePay.";
    if (!window.confirm(q)) return;
    const r = await fetchWithSupabaseSession(`/api/payment-links/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "admin").catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    if (!j.success) setMsg({ ok: false, text: j.error?.message ?? "Não foi possível." });
    await load();
  }

  async function copy(l: Link) {
    if (!l.url) return;
    try {
      await navigator.clipboard.writeText(l.url);
      setCopied(l.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copie o link:", l.url);
    }
  }

  if (links === null) return null;

  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">💳 Link de pagamento (InfinitePay)</h3>
        {live.length ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paid >= total - 0.01 && total > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {paid >= total - 0.01 && total > 0 ? "✓ Tudo pago" : `Pago ${brl(paid)} de ${brl(total)}`}
          </span>
        ) : null}
      </div>

      {!connected ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          InfinitePay ainda não conectada. Em <a href="/integracoes" className="font-semibold underline">Integrações</a>, coloque a InfiniteTag e a chave da API.
        </p>
      ) : null}

      {live.length ? (
        <ul className="divide-y divide-prime-border rounded-xl border border-prime-border">
          {live.map((l) => (
            <li key={l.id} className="grid gap-1.5 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b>{KIND[l.kind]}</b> · {brl(l.amount)}
                  {l.status === "pago" ? (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      ✓ Pago {dt(l.paid_at)}
                      {l.capture_method === "pix" ? " · PIX" : l.installments && l.installments > 1 ? ` · ${l.installments}x` : l.capture_method ? " · cartão" : " · baixa manual"}
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">Aguardando pagamento</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {l.status === "aberto" && l.url ? (
                    <>
                      <button type="button" onClick={() => void copy(l)} className="rounded-lg bg-[#111] px-3 py-1 text-xs font-semibold text-prime-gold">
                        {copied === l.id ? "✓ Copiado" : "Copiar link"}
                      </button>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Segue o link para pagamento (${KIND[l.kind].toLowerCase()} · ${brl(l.amount)}): ${l.url}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg px-3 py-1 text-xs font-semibold ring-1 ring-prime-border"
                      >
                        WhatsApp
                      </a>
                      <button type="button" onClick={() => void act(l.id, "pago_manual")} className="rounded-lg px-3 py-1 text-xs ring-1 ring-prime-border">
                        Já pagou
                      </button>
                      <button type="button" onClick={() => void act(l.id, "cancelar")} className="rounded-lg px-2 py-1 text-xs text-red-700">
                        Cancelar
                      </button>
                    </>
                  ) : null}
                  {l.receipt_url ? (
                    <a href={l.receipt_url} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-1 text-xs font-semibold ring-1 ring-prime-border">
                      Comprovante
                    </a>
                  ) : null}
                </span>
              </div>
              {l.status === "pago" && l.paid_amount && l.paid_amount > l.amount + 0.01 ? (
                <p className="text-xs text-prime-muted">Cliente pagou {brl(l.paid_amount)} (juros do parcelamento por conta dele).</p>
              ) : null}
              {l.status === "pago" && !l.booking_payment_id ? (
                <p className="text-xs text-prime-muted">Entra como pagamento das corridas assim que o orçamento for aprovado.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-prime-muted">Gere o link aqui e mande ao cliente: quando ele pagar, o sistema avisa e lança o recebimento sozinho.</p>
      )}

      {open ? (
        <div className="grid gap-3 rounded-xl bg-prime-bg/60 p-3">
          <div className="flex flex-wrap gap-2">
            {(["sinal", "saldo", "total", "outro"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={`rounded-lg px-3 py-1.5 text-sm ${kind === k ? "bg-[#111] font-semibold text-prime-gold" : "bg-white ring-1 ring-prime-border"}`}
              >
                {k === "sinal" ? "Sinal 50%" : k === "saldo" ? "Saldo restante" : KIND[k]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Valor do link (R$)</span>
              <input
                className="rounded-xl border border-prime-border px-3 py-2"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Parcelas sem juros para o cliente</span>
              <select className="rounded-xl border border-prime-border px-3 py-2" value={assured} onChange={(e) => setAssured(Number(e.target.value))}>
                <option value={0}>Nenhuma — taxa sempre por conta do cliente</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Só à vista (parcelado: juros do cliente)" : `Até ${n}x sem juros (você paga a taxa)`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-prime-muted">O cliente pode pagar em PIX ou cartão em até 12x. Acima das parcelas sem juros, a taxa é repassada para ele.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !connected} onClick={() => void create()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-50">
              {busy ? "Gerando…" : "Gerar link"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!connected} onClick={startNew} className="justify-self-start rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-prime-gold disabled:opacity-50">
          + Gerar link de pagamento
        </button>
      )}
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
