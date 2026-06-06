"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { ClientCadastroForm, clientRowToForm } from "@/components/client-cadastro-form";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { ClientPricingRulesPanel } from "@/components/client-pricing-rules-panel";
import { formatServiceTypesLabel } from "@/lib/clients/client-service-types";

export type ClientRow = {
  id: string;
  type: string;
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  registry_status?: string | null;
  active: boolean;
  portal_requests_enabled?: boolean;
  service_types?: string[] | null;
};

type Props = {
  initialClients: ClientRow[];
};

export function ClientsFleetPanel({ initialClients }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pricingClientId, setPricingClientId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/clients", { method: "GET" }, "admin");
    const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
    if (res.ok && json.success) {
      setClients(json.data ?? []);
    }
    router.refresh();
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function deactivate(client: ClientRow) {
    if (!window.confirm(`Desactivar ${client.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/clients/${client.id}`,
        { method: "PATCH", body: JSON.stringify({ active: false }) },
        "admin"
      );
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Falha");
      setMessage(`${client.name} desactivado.`);
      setEditingId(null);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const editingClient = editingId ? clients.find((c) => c.id === editingId) : null;

  return (
    <>
      {editingClient ? (
        <>
          <div className="mb-3">
            <BackButton fallbackHref="/clients" onClick={() => setEditingId(null)} />
          </div>
          <ClientCadastroForm
          title={`Editar: ${editingClient.name}`}
          clientId={editingClient.id}
          initial={clientRowToForm(editingClient)}
          onSuccess={() => {
            setEditingId(null);
            void reload();
          }}
          onCancel={() => setEditingId(null)}
        />
        </>
      ) : (
        <ClientCadastroForm title="Novo cliente" onSuccess={() => void reload()} />
      )}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Clientes activos</h2>
        {message ? <p className="mt-2 text-sm text-slate-400">{message}</p> : null}
        {clients.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum cliente registado.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => (
              <article
                key={client.id}
                className={`rounded-xl border bg-slate-900/40 p-4 ${
                  editingId === client.id ? "border-amber-500/50" : "border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl text-amber-500/80" aria-hidden>
                    🏢
                  </span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                    {client.type}
                  </span>
                </div>
                <p className="mt-3 font-medium text-white">{client.name}</p>
                {client.trade_name ? <p className="text-xs text-slate-500">{client.trade_name}</p> : null}
                <p className="mt-2 text-xs">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                      client.portal_requests_enabled
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700/60 text-slate-400"
                    }`}
                  >
                    Portal: {client.portal_requests_enabled ? "solicitações activas" : "modo consulta"}
                  </span>
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {client.type === "PJ" ? "CNPJ" : "CPF"}: {client.document ?? "—"}
                </p>
                <p className="text-xs text-slate-500">{client.phone ?? client.email ?? "—"}</p>
                <p className="mt-2 text-xs text-slate-400">{formatServiceTypesLabel(client.service_types)}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="text-amber-400 hover:text-amber-300"
                    onClick={() => {
                      setEditingId(client.id);
                      setMessage(null);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-200"
                    onClick={() => setPricingClientId(client.id)}
                  >
                    Precificação
                  </button>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300"
                    disabled={busy}
                    onClick={() => void deactivate(client)}
                  >
                    Desactivar
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full text-right text-sm font-medium text-amber-400 hover:text-amber-300"
                  onClick={() => {
                    setEditingId(client.id);
                    setMessage(null);
                  }}
                >
                  Ver detalhes →
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {pricingClientId ? (
        <>
          <div className="mt-6 mb-3">
            <BackButton fallbackHref="/clients" onClick={() => setPricingClientId(null)} />
          </div>
          <ClientPricingRulesPanel
          clientId={pricingClientId}
          clientName={clients.find((c) => c.id === pricingClientId)?.name ?? "Cliente"}
        />
        </>
      ) : null}
    </>
  );
}
