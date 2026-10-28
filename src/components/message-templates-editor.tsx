"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import {
  AUDIENCE_LABEL,
  MESSAGE_EVENTS,
  TEMPLATE_VARIABLES,
  renderTemplate,
  type MessageAudience,
  type MessageEventId
} from "@/lib/messages/templates";

type Effective = { event: MessageEventId; audience: MessageAudience; body: string; is_custom: boolean };

const SAMPLE = {
  nome: "Ana",
  passageiro: "Ana Souza",
  telefone_passageiro: "(27) 99999-0000",
  empresa: "Comexport",
  numero: "A1B2C3D4",
  data: "30/10/2026",
  horario: "14:00",
  origem: "Aeroporto de Vitória",
  destino: "Enseada do Suá",
  motorista: "Carlos",
  telefone_motorista: "(27) 98888-0000",
  veiculo: "Toyota Corolla",
  cor: "preto",
  placa: "ABC1D23",
  observacoes: "Placa de recepção com o nome",
  linha_valor_parceiro: "\n💰 Seu repasse: R$ 154,00"
};

function key(e: string, a: string) {
  return `${e}:${a}`;
}

/** Configurações → textos de WhatsApp por evento e destinatário, com prévia. */
export function MessageTemplatesEditor() {
  const [items, setItems] = useState<Effective[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ key: string; text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession("/api/messages/templates", {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Effective[] };
    const list = res.ok && json.success ? (json.data ?? []) : [];
    setItems(list);
    setDrafts(Object.fromEntries(list.map((t) => [key(t.event, t.audience), t.body])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byEvent = useMemo(
    () => MESSAGE_EVENTS.map((ev) => ({ ev, rows: items.filter((t) => t.event === ev.id) })).filter((g) => g.rows.length),
    [items]
  );

  async function save(t: Effective) {
    const k = key(t.event, t.audience);
    setBusyKey(k);
    const res = await fetchWithSupabaseSession(
      "/api/messages/templates",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: t.event, audience: t.audience, body: drafts[k] }) },
      "admin"
    );
    setBusyKey(null);
    setNotice({ key: k, text: res.ok ? "Texto salvo." : "Não foi possível salvar.", error: !res.ok });
    if (res.ok) await load();
  }

  async function restore(t: Effective) {
    const k = key(t.event, t.audience);
    setBusyKey(k);
    const res = await fetchWithSupabaseSession(
      "/api/messages/templates",
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: t.event, audience: t.audience }) },
      "admin"
    );
    setBusyKey(null);
    setNotice({ key: k, text: res.ok ? "Texto padrão restaurado." : "Não foi possível restaurar.", error: !res.ok });
    if (res.ok) await load();
  }

  return (
    <section className="card mt-8 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-prime-text">Mensagens de WhatsApp</h2>
        <p className="mt-1 text-sm text-prime-muted">
          Edite o texto de cada mensagem. Os campos entre chaves são preenchidos sozinhos com os dados da corrida. O passageiro
          recebe no máximo 3 mensagens por viagem: lembrete, motorista chegou e, se houver, alteração.
        </p>
        <details className="mt-2 text-xs text-prime-muted">
          <summary className="cursor-pointer">Campos disponíveis</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <li key={v.key}>
                <code className="rounded bg-prime-bg px-1">{`{${v.key}}`}</code> {v.label}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {loading ? <p className="text-sm text-prime-muted">Carregando mensagens…</p> : null}

      {byEvent.map(({ ev, rows }) => (
        <div key={ev.id} className="space-y-3 border-t border-prime-border pt-4">
          <div>
            <h3 className="font-semibold text-prime-text">{ev.label}</h3>
            <p className="text-xs text-prime-muted">{ev.when}</p>
          </div>
          {rows.map((t) => {
            const k = key(t.event, t.audience);
            const draft = drafts[k] ?? t.body;
            return (
              <div key={k} className="grid gap-3 lg:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="flex items-center gap-2">
                    Para: <strong>{AUDIENCE_LABEL[t.audience]}</strong>
                    {t.is_custom ? (
                      <span className="rounded-full border border-prime-gold px-2 text-[10px] text-prime-gold">editado</span>
                    ) : null}
                  </span>
                  <textarea
                    id={`tpl-${k}`}
                    rows={5}
                    className="rounded-lg border border-prime-border bg-white px-3 py-2 font-mono text-xs text-prime-text"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                  />
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyKey === k || draft.trim().length < 3}
                      onClick={() => void save(t)}
                      className="rounded-lg bg-prime-gold px-3 py-1.5 text-xs font-medium text-prime-text disabled:opacity-50"
                    >
                      Salvar texto
                    </button>
                    {t.is_custom ? (
                      <button
                        type="button"
                        disabled={busyKey === k}
                        onClick={() => void restore(t)}
                        className="rounded-lg border border-prime-border px-3 py-1.5 text-xs text-prime-muted"
                      >
                        Voltar ao texto padrão
                      </button>
                    ) : null}
                    {notice?.key === k ? (
                      <span className={`text-xs ${notice.error ? "text-red-700" : "text-emerald-700"}`}>{notice.text}</span>
                    ) : null}
                  </span>
                </label>
                <div className="grid gap-1 text-sm">
                  <span className="text-prime-muted">Prévia</span>
                  <div className="whitespace-pre-wrap rounded-lg bg-[#DCF8C6] px-3 py-2 text-xs text-[#111]">
                    {renderTemplate(draft, SAMPLE)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
