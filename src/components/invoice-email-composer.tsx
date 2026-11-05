"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Draft = {
  to: string[];
  cc: string[];
  subject: string;
  message: string;
  files: { boleto: boolean; nf: boolean; voucher: boolean };
  link: string;
  copy_to: string;
};

const split = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Janela para escrever e enviar a fatura por e-mail: para, cópia, assunto, texto e anexos. */
export function InvoiceEmailComposer({
  invoiceId,
  title,
  onClose,
  onSent,
  tipo = "fatura"
}: {
  tipo?: "fatura" | "lembrete";
  invoiceId: string;
  title: string;
  onClose: () => void;
  onSent: (text: string) => void;
}) {
  const [d, setD] = useState<Draft | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState({ boleto: true, nf: true, voucher: true });
  const [copyMe, setCopyMe] = useState(true);
  const [saveEmail, setSaveEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchWithSupabaseSession(`/api/client-invoices/${invoiceId}/send${tipo === "lembrete" ? "?tipo=lembrete" : ""}`, {}, "admin")
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Draft; error?: { message?: string } }) => {
        if (!j.success || !j.data) return setError(j.error?.message ?? "Não foi possível abrir o e-mail.");
        setD(j.data);
        setTo(j.data.to.join(", "));
        setSubject(j.data.subject);
        setMessage(j.data.message);
      })
      .catch(() => setError("Sem conexão."));
  }, [invoiceId, tipo]);

  async function send() {
    const toList = split(to);
    if (!toList.length) return setError("Informe pelo menos um e-mail em “Para”.");
    setBusy(true);
    setError(null);
    const r = await fetchWithSupabaseSession(
      `/api/client-invoices/${invoiceId}/send`,
      {
        method: "POST",
        body: JSON.stringify({ to: toList, cc: split(cc), subject, message, attach, copy_me: copyMe, save_client_email: saveEmail, tipo })
      },
      "admin"
    );
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { sent_to: string[]; attachments: string[] }; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success || !j.data) return setError(j.error?.message ?? "O e-mail não saiu.");
    onSent(
      `E-mail enviado para ${j.data.sent_to.join(", ")}${j.data.attachments.length ? ` com ${j.data.attachments.length} anexo(s)` : ""}.${copyMe ? " Cópia na caixa contato@primevitoria.com." : ""}`
    );
  }

  const field = "w-full rounded-lg border border-prime-border bg-white px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-prime-border px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">{tipo === "lembrete" ? "Enviar lembrete de pagamento" : "Enviar fatura por e-mail"}</p>
            <h3 className="font-semibold">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full ring-1 ring-prime-border" aria-label="Fechar">
            ×
          </button>
        </header>
        {!d ? (
          <p className="p-5 text-sm text-prime-muted">{error ?? "Montando o e-mail…"}</p>
        ) : (
          <div className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Para</span>
              <input className={field} value={to} onChange={(e) => setTo(e.target.value)} placeholder="financeiro@cliente.com.br, fulano@cliente.com.br" />
              {!d.to.length ? (
                <label className="flex items-center gap-2 text-xs text-prime-muted">
                  <input type="checkbox" checked={saveEmail} onChange={(e) => setSaveEmail(e.target.checked)} />
                  Cliente sem e-mail no cadastro: salvar o primeiro como e-mail dele para as próximas faturas
                </label>
              ) : null}
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Cópia (opcional)</span>
              <input className={field} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="separe por vírgula" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Assunto</span>
              <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Mensagem</span>
              <textarea className={`${field} min-h-[220px] leading-relaxed`} value={message} onChange={(e) => setMessage(e.target.value)} />
              <span className="text-xs text-prime-muted">A assinatura da Prime e o botão “Ver fatura e 2ª via” entram sozinhos no fim.</span>
            </label>
            <div className="grid gap-1 rounded-xl bg-prime-bg p-3 text-sm">
              <span className="font-medium">Anexos</span>
              {(
                [
                  ["boleto", "Boleto (PDF)"],
                  ["nf", "Nota fiscal"],
                  ["voucher", "Voucher do cliente"]
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={`flex items-center gap-2 ${d.files[k] ? "" : "text-prime-muted"}`}>
                  <input
                    type="checkbox"
                    disabled={!d.files[k]}
                    checked={d.files[k] && attach[k]}
                    onChange={(e) => setAttach((a) => ({ ...a, [k]: e.target.checked }))}
                  />
                  {label}
                  {!d.files[k] ? " — não anexado na fatura" : ""}
                </label>
              ))}
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />
                Mandar uma cópia oculta para {d.copy_to}
              </label>
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
                Cancelar
              </button>
              <button type="button" disabled={busy} onClick={() => void send()} className="rounded-lg bg-[#111] px-5 py-2 text-sm font-semibold text-[#C9A84C] disabled:opacity-50">
                {busy ? "Enviando…" : "Enviar e-mail"}
              </button>
            </div>
            <p className="text-xs text-prime-muted">
              Sai de operacao@primevitoria.com; a resposta do cliente chega em contato@primevitoria.com. {tipo === "lembrete" ? "Fica registrado no histórico da fatura." : "A fatura passa para “Enviada”."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
