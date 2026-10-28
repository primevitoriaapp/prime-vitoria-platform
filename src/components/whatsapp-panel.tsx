"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { AUDIENCE_LABEL, MESSAGE_EVENTS, whatsappLink, type MessageAudience } from "@/lib/messages/templates";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type Item = {
  id: string;
  trip_id: string | null;
  event: string;
  audience: MessageAudience;
  recipient_name: string | null;
  phone: string | null;
  body: string;
  status: "pendente" | "enviada" | "falhou" | "ignorada";
  error: string | null;
  created_at: string;
  sent_at: string | null;
  trip_scheduled_at: string | null;
  trip_passenger: string | null;
  client_name: string | null;
};

const FILTERS = [
  ["pendente", "A enviar"],
  ["falhou", "Com erro"],
  ["enviada", "Enviadas"],
  ["todas", "Todas"]
] as const;

const STATUS_STYLE: Record<Item["status"], string> = {
  pendente: "bg-amber-100 text-amber-900",
  enviada: "bg-emerald-100 text-emerald-800",
  falhou: "bg-red-100 text-red-800",
  ignorada: "bg-gray-100 text-gray-600"
};
const STATUS_LABEL: Record<Item["status"], string> = { pendente: "A enviar", enviada: "Enviada", falhou: "Erro", ignorada: "Ignorada" };

/** Painel WhatsApp: tudo o que precisa ser mandado para cliente, passageiro e motorista. */
export function WhatsappPanel({ tenantId }: { tenantId: string | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pendente");
  const [items, setItems] = useState<Item[]>([]);
  const [auto, setAuto] = useState(false);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { body: string; phone: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/messages?status=${filter}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { auto: boolean; pending: number; items: Item[] } };
    if (res.ok && json.success && json.data) {
      setItems(json.data.items);
      setAuto(json.data.auto);
      setPending(json.data.pending);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useTenantTableRefresh(tenantId, ["whatsapp_messages", "trips"], load);

  async function act(item: Item, action: "enviar" | "marcar_enviada" | "ignorar") {
    const e = edits[item.id];
    setBusyId(item.id);
    await fetch(`/api/whatsapp/messages/${item.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(e ? { body: e.body, phone: e.phone } : {}) })
    });
    setBusyId(null);
    void load();
  }

  function openManual(item: Item) {
    const e = edits[item.id];
    const link = whatsappLink(e?.phone ?? item.phone, e?.body ?? item.body);
    if (!link) {
      window.alert("Telefone inválido. Corrija o número e tente de novo.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
    void act(item, "marcar_enviada");
  }

  return (
    <div className="space-y-5">
      <section className={`rounded-xl border p-4 text-sm ${auto ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        {auto ? (
          <p>
            <b>WhatsApp automático ligado.</b> As mensagens saem sozinhas quando o cliente pede, quando você atribui o motorista e quando a corrida é
            cancelada. Aqui você acompanha e reenvia o que falhar.
          </p>
        ) : (
          <p>
            <b>WhatsApp automático ainda não conectado.</b> As mensagens ficam prontas aqui: clique em <b>Enviar pelo WhatsApp</b>, confira e aperte
            enviar. Quando conectarmos o número da central (QR Code), elas passam a sair sozinhas.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === id ? "bg-[#111] font-semibold text-[#fff]" : "border border-prime-border bg-white text-prime-muted"}`}
          >
            {label}
            {id === "pendente" && pending > 0 ? ` (${pending})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl border border-prime-border bg-white" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-prime-border bg-white p-6 text-center text-sm text-prime-muted">
          {filter === "pendente" ? "Nenhuma mensagem esperando. Tudo em dia." : "Nada por aqui."}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((m) => {
            const ev = MESSAGE_EVENTS.find((e) => e.id === m.event);
            const e = edits[m.id];
            const editable = m.status !== "enviada";
            return (
              <li key={m.id} className="rounded-xl border border-prime-border bg-white p-4 shadow-prime-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {ev?.label ?? m.event} → {AUDIENCE_LABEL[m.audience]}
                      {m.recipient_name ? `: ${m.recipient_name}` : ""}
                    </p>
                    <p className="text-xs text-prime-muted">
                      {m.client_name ?? "—"}
                      {m.trip_scheduled_at ? ` · corrida ${formatBrDateTime(m.trip_scheduled_at)}` : ""}
                      {m.trip_id ? (
                        <>
                          {" · "}
                          <a href={`/agenda?trip=${m.trip_id}`} className="text-prime-gold hover:underline">
                            abrir corrida
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                </div>

                <label className="mt-3 grid gap-1 text-xs text-prime-muted">
                  Telefone
                  <input
                    value={e?.phone ?? m.phone ?? ""}
                    onChange={(ev2) => setEdits((x) => ({ ...x, [m.id]: { body: x[m.id]?.body ?? m.body, phone: ev2.target.value } }))}
                    disabled={!editable}
                    placeholder="(27) 99999-9999"
                    className="rounded-md border border-prime-border px-2 py-1.5 text-sm text-prime-text"
                  />
                </label>
                <textarea
                  value={e?.body ?? m.body}
                  onChange={(ev2) => setEdits((x) => ({ ...x, [m.id]: { phone: x[m.id]?.phone ?? m.phone ?? "", body: ev2.target.value } }))}
                  disabled={!editable}
                  rows={5}
                  className="mt-2 w-full rounded-md border border-prime-border px-2 py-1.5 text-sm text-prime-text"
                />
                {m.error && m.status !== "enviada" ? <p className="mt-1 text-xs text-red-700">{m.error}</p> : null}
                {m.sent_at ? <p className="mt-1 text-xs text-prime-muted">Enviada em {formatBrDateTime(m.sent_at)}</p> : null}

                {editable ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => openManual(m)}
                      className="rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-[#fff] disabled:opacity-50"
                    >
                      Enviar pelo WhatsApp
                    </button>
                    {auto ? (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => void act(m, "enviar")}
                        className="rounded-lg bg-[#111] px-3 py-2 text-sm font-semibold text-[#fff] disabled:opacity-50"
                      >
                        {m.status === "falhou" ? "Tentar de novo (automático)" : "Enviar automático"}
                      </button>
                    ) : null}
                    {m.status !== "ignorada" ? (
                      <button type="button" disabled={busyId === m.id} onClick={() => void act(m, "ignorar")} className="px-2 text-sm text-prime-muted hover:underline">
                        Não precisa
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
