"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientCadastroForm, clientRowToForm } from "@/components/client-cadastro-form";
import { ClientPricingRulesPanel } from "@/components/client-pricing-rules-panel";

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
    const res = await fetch("/api/clients", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
    if (res.ok && json.success) {
      setClients(json.data ?? []);
    }
    router.refresh();
  }, [router]);

  async function deactivate(client: ClientRow) {
    if (!window.confirm(`Desactivar ${client.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: false })
      });
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
      ) : (
        <ClientCadastroForm title="Novo cliente" onSuccess={() => void reload()} />
      )}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Clientes activos</h2>
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        {clients.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum cliente registado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Contacto</th>
                  <th className="py-2">Acções</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium">
                      {client.name}
                      {client.trade_name ? (
                        <span className="block text-xs font-normal text-slate-500">{client.trade_name}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{client.type}</td>
                    <td className="py-2 pr-3">{client.document ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {client.phone ?? client.whatsapp ?? client.email ?? "—"}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="mr-3 text-amber-800"
                        onClick={() => {
                          setEditingId(client.id);
                          setMessage(null);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="mr-3 text-slate-700"
                        onClick={() => setPricingClientId(client.id)}
                      >
                        Precificação
                      </button>
                      <button
                        type="button"
                        className="text-red-700"
                        disabled={busy}
                        onClick={() => void deactivate(client)}
                      >
                        Desactivar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pricingClientId ? (
        <ClientPricingRulesPanel
          clientId={pricingClientId}
          clientName={clients.find((c) => c.id === pricingClientId)?.name ?? "Cliente"}
        />
      ) : null}
    </>
  );
}
