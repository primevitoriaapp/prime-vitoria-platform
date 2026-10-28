"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Msg = {
  event: string;
  event_label: string;
  audience: string;
  audience_label: string;
  text: string;
  phone: string | null;
  whatsapp_url: string | null;
};

/** Na corrida: mensagens prontas. Um clique abre o WhatsApp com o texto preenchido. */
export function TripWhatsappMessages({ tripId }: { tripId: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseSession(`/api/trips/${tripId}/messages`, {}, "admin")
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Msg[] }) => {
        if (!cancelled) setMsgs(json?.success ? (json.data ?? []) : []);
      })
      .catch(() => !cancelled && setMsgs([]));
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (!msgs || msgs.length === 0) return null;

  async function copy(k: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="rounded-lg border border-prime-border bg-white p-3 shadow-prime-card">
      <h3 className="text-sm font-semibold text-prime-text">Mensagens de WhatsApp</h3>
      <p className="text-xs text-prime-muted">Clique para abrir o WhatsApp com o texto pronto. Os textos são editados em Configurações.</p>
      <ul className="mt-2 divide-y divide-prime-border">
        {msgs.map((m) => {
          const k = `${m.event}:${m.audience}`;
          return (
            <li key={k} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setOpen(open === k ? null : k)} className="text-left">
                  <span className="font-medium text-prime-text">{m.event_label}</span>
                  <span className="text-prime-muted"> · {m.audience_label}</span>
                </button>
                <span className="flex gap-2">
                  <button type="button" onClick={() => void copy(k, m.text)} className="rounded border border-prime-border px-2 py-1 text-xs">
                    {copied === k ? "Copiado" : "Copiar"}
                  </button>
                  {m.whatsapp_url ? (
                    <a
                      href={m.whatsapp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-[#25D366] px-2 py-1 text-xs font-medium text-white"
                    >
                      Enviar
                    </a>
                  ) : (
                    <span className="px-2 py-1 text-xs text-prime-muted" title="Sem telefone cadastrado">
                      sem telefone
                    </span>
                  )}
                </span>
              </div>
              {open === k ? <pre className="mt-2 whitespace-pre-wrap rounded bg-prime-bg p-2 text-xs">{m.text}</pre> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
