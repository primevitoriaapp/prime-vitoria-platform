"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** "E-mails para faturas": todos recebem a fatura quando ela é enviada pelo sistema. */
export function ClientInvoiceEmailsCard({ clientId }: { clientId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/clients/${clientId}/invoice-emails`, {}, "admin")
      .then((r) => r.json())
      .then((j) => (j?.success ? setText((j.data.emails as string[]).join("\n")) : null))
      .catch(() => undefined);
  }, [clientId]);
  async function save() {
    setBusy(true);
    setMsg(null);
    const emails = text.split(/[\s,;]+/).filter(Boolean);
    const r = await fetchWithSupabaseSession(`/api/clients/${clientId}/invoice-emails`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setText((j.data.emails as string[]).join("\n"));
      setMsg({ ok: true, text: `✓ Salvo: ${(j.data.emails as string[]).length} e-mail(s) recebem as faturas.` });
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível salvar." });
  }
  return (
    <section className="grid gap-2 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <h3 className="font-semibold">📧 E-mails para faturas</h3>
      <p className="text-xs text-prime-muted">Um por linha (ou separados por vírgula). Todos recebem a fatura quando ela é enviada pelo sistema. As respostas do cliente vão para contato@primevitoria.com.</p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"financeiro@empresa.com.br\ncontasapagar@empresa.com.br"} className="rounded-xl border border-prime-border px-3 py-2 text-sm" />
      <button type="button" disabled={busy} onClick={() => void save()} className="justify-self-start rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-50">
        {busy ? "Salvando…" : "Salvar e-mails"}
      </button>
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
