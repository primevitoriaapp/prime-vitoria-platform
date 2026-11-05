"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { InvoiceEmailComposer } from "@/components/invoice-email-composer";

type Inv = {
  id: string;
  title: string;
  status: string;
  due_date: string;
  sent_at: string | null;
  boleto_path: string | null;
  boleto_line: string | null;
  nf_path: string | null;
  voucher_path: string | null;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Barra de ações da fatura (equipe Prime). */
export function InvoiceDetailActions({ inv }: { inv: Inv }) {
  const router = useRouter();
  const [composer, setComposer] = useState<"fatura" | "lembrete" | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("boleto");
  const [more, setMore] = useState(false);
  const [dueEdit, setDueEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<"boleto" | "nf" | "voucher">("boleto");
  const live = inv.status !== "paga" && inv.status !== "cancelada";

  async function patch(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    const r = await fetchWithSupabaseSession(`/api/client-invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify(body) }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    setMsg(r.ok && j.success ? { ok: true, text: okText } : { ok: false, text: j.error?.message ?? "Falha ao salvar." });
    router.refresh();
  }

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    const r = await fetchWithSupabaseSession(`/api/client-invoices/${inv.id}/files`, { method: "POST", body: fd }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    setMsg(r.ok && j.success ? { ok: true, text: "Arquivo anexado." } : { ok: false, text: j.error?.message ?? "Falha ao anexar." });
    router.refresh();
  }

  const pick = (k: "boleto" | "nf" | "voucher") => {
    setKind(k);
    setMore(false);
    window.setTimeout(() => fileRef.current?.click(), 0);
  };

  const btn = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-prime-border bg-white hover:ring-prime-gold disabled:opacity-50";

  return (
    <section className="grid gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      {composer ? (
        <InvoiceEmailComposer
          invoiceId={inv.id}
          title={inv.title}
          tipo={composer}
          onClose={() => setComposer(null)}
          onSent={(text) => {
            setComposer(null);
            setMsg({ ok: true, text });
            router.refresh();
          }}
        />
      ) : null}

      <div className="grid gap-3 rounded-2xl border border-prime-border bg-white p-3 shadow-prime-card lg:grid-cols-[minmax(220px,auto)_1fr] lg:items-center">
        <div className={`flex items-center gap-3 rounded-xl p-3 text-sm ${inv.sent_at ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <span className="text-xl">✉</span>
          <span>
            {inv.sent_at
              ? `Cliente notificado em ${new Date(inv.sent_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às")}.`
              : "Ainda não enviada ao cliente."}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href={`/fatura/${inv.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#fff]">
            📄 Ver fatura
          </a>
          <a href={`/api/client-invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" className={btn}>
            ⬇ Fatura em PDF
          </a>
          {inv.boleto_path ? (
            <a href={`/api/client-invoices/${inv.id}/files?kind=boleto`} target="_blank" rel="noopener noreferrer" className={btn}>
              ⬇ Baixar boleto
            </a>
          ) : live ? (
            <button type="button" className={btn} onClick={() => pick("boleto")} disabled={busy}>
              ⬆ Anexar boleto
            </button>
          ) : null}
          {inv.boleto_line ? (
            <button
              type="button"
              className={btn}
              onClick={() => {
                void navigator.clipboard.writeText(inv.boleto_line ?? "").then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "✓ Copiada" : "⧉ Linha digitável"}
            </button>
          ) : null}
          {live ? (
            inv.status === "aberta" ? (
              <button type="button" className={btn} onClick={() => setComposer("fatura")} disabled={busy}>
                ✉ Enviar ao cliente
              </button>
            ) : (
              <button type="button" className={`${btn} text-[#8A5A00] ring-[#E5C77A]`} onClick={() => setComposer("lembrete")} disabled={busy}>
                🔔 Enviar lembrete
              </button>
            )
          ) : null}
          {live ? (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-[#fff]" onClick={() => setPayOpen(true)} disabled={busy}>
              ✓ Marcar como paga
            </button>
          ) : null}
          <div className="relative">
            <button type="button" className={btn} onClick={() => setMore((v) => !v)} aria-label="Mais ações">
              •••
            </button>
            {more ? (
              <div className="absolute right-0 z-30 mt-2 grid w-60 gap-0.5 rounded-xl border border-prime-border bg-white p-1.5 text-sm shadow-xl">
                {live ? (
                  <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-prime-bg" onClick={() => {
                      setDueEdit(inv.due_date);
                      setMore(false);
                    }}>
                    Alterar vencimento
                  </button>
                ) : null}
                {live ? (
                  <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-prime-bg" onClick={() => setComposer("fatura")}>
                    {inv.sent_at ? "Reenviar a fatura" : "Enviar fatura por e-mail"}
                  </button>
                ) : null}
                {live && inv.status === "aberta" ? (
                  <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-prime-bg" onClick={() => {
                      setMore(false);
                      void patch({ status: "enviada" }, "Marcada como enviada ao cliente.");
                    }}>
                    Já enviei por fora (marcar enviada)
                  </button>
                ) : null}
                <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-prime-bg" onClick={() => pick("boleto")}>
                  {inv.boleto_path ? "Trocar boleto" : "Anexar boleto"}
                </button>
                <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-prime-bg" onClick={() => pick("nf")}>
                  {inv.nf_path ? "Trocar nota fiscal" : "Anexar nota fiscal"}
                </button>
                {inv.nf_path ? (
                  <a className="rounded-lg px-3 py-2 hover:bg-prime-bg" href={`/api/client-invoices/${inv.id}/files?kind=nf`} target="_blank" rel="noopener noreferrer">
                    Ver nota fiscal
                  </a>
                ) : null}
                <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-prime-bg" onClick={() => pick("voucher")}>
                  {inv.voucher_path ? "Trocar voucher" : "Anexar voucher do cliente"}
                </button>
                {inv.voucher_path ? (
                  <a className="rounded-lg px-3 py-2 hover:bg-prime-bg" href={`/api/client-invoices/${inv.id}/files?kind=voucher`} target="_blank" rel="noopener noreferrer">
                    Ver voucher do cliente
                  </a>
                ) : null}
                {live ? (
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setMore(false);
                      if (window.confirm("Cancelar esta fatura? As corridas voltam a ficar sem fatura.")) void patch({ status: "cancelada" }, "Fatura cancelada.");
                    }}
                  >
                    Cancelar fatura
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {dueEdit != null ? (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <label className="grid gap-1 text-sm">
            Novo vencimento
            <input type="date" value={dueEdit} onChange={(e) => setDueEdit(e.target.value)} className="rounded-lg border border-prime-border px-3 py-2" />
          </label>
          <button
            type="button"
            disabled={busy || !dueEdit}
            onClick={() => {
              const v = dueEdit;
              setDueEdit(null);
              if (v && v !== inv.due_date) void patch({ due_date: v }, "Vencimento alterado. Contas a receber e carteira dos motoristas atualizadas.");
            }}
            className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C]"
          >
            Salvar
          </button>
          <button type="button" onClick={() => setDueEdit(null)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
            Cancelar
          </button>
        </div>
      ) : null}

      {payOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold">Confirmar pagamento</h3>
            <p className="text-sm text-prime-muted">A data do pagamento define quando os motoristas parceiros recebem (data + conciliação, em dia útil).</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                Dia em que o dinheiro entrou
                <input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} className="rounded-lg border border-prime-border px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Forma
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-prime-border px-3 py-2">
                  <option value="boleto">Boleto bancário</option>
                  <option value="pix">PIX</option>
                  <option value="transferencia">Transferência (TED)</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPayOpen(false)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
                Voltar
              </button>
              <button
                type="button"
                disabled={busy || !paidOn}
                onClick={() => {
                  setPayOpen(false);
                  void patch({ status: "paga", paid_on: paidOn, payment_method: method }, "Pagamento confirmado. Repasses aos motoristas liberados com a nova data.");
                }}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-[#fff]"
              >
                Confirmar pagamento
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
