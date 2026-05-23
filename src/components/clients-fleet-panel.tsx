"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityCrudPanel } from "@/components/entity-crud-panel";
import { ClientPricingRulesPanel } from "@/components/client-pricing-rules-panel";

export type ClientRow = {
  id: string;
  type: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  active: boolean;
};

type Props = {
  initialClients: ClientRow[];
};

export function ClientsFleetPanel({ initialClients }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "PJ", name: "", document: "", email: "", phone: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [pricingClientId, setPricingClientId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/clients", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
    if (res.ok && json.success) {
      setClients(json.data ?? []);
    }
    router.refresh();
  }, [router]);

  function startEdit(client: ClientRow) {
    setEditingId(client.id);
    setForm({
      type: client.type,
      name: client.name,
      document: client.document ?? "",
      email: client.email ?? "",
      phone: client.phone ?? ""
    });
    setMessage(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: form.type,
          name: form.name.trim(),
          document: form.document.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null
        })
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Falha ao actualizar");
      setEditingId(null);
      setMessage("Cliente actualizado.");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

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
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <EntityCrudPanel
        title="Novo cliente"
        endpoint="/api/clients"
        fields={[
          { key: "type", label: "Tipo (PF/PJ)", required: true },
          { key: "name", label: "Nome", required: true },
          { key: "document", label: "Documento" },
          { key: "email", label: "E-mail", type: "email" },
          { key: "phone", label: "Telefone" }
        ]}
        onSuccess={() => void reload()}
      />

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
                  <th className="py-2">Acções</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-b border-slate-100">
                    {editingId === client.id ? (
                      <>
                        <td className="py-2 pr-2">
                          <input
                            className="w-full rounded border px-2 py-1"
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={form.type}
                            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                            className="rounded border px-2 py-1"
                          >
                            <option value="PF">PF</option>
                            <option value="PJ">PJ</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="w-full rounded border px-2 py-1"
                            value={form.document}
                            onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
                          />
                        </td>
                        <td className="py-2">
                          <button type="button" disabled={busy} onClick={() => void saveEdit()} className="mr-2 text-amber-800">
                            Guardar
                          </button>
                          <button type="button" onClick={() => setEditingId(null)}>
                            Cancelar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 font-medium">{client.name}</td>
                        <td className="py-2 pr-3">{client.type}</td>
                        <td className="py-2 pr-3">{client.document ?? "—"}</td>
                        <td className="py-2">
                          <button type="button" className="mr-3 text-amber-800" onClick={() => startEdit(client)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="mr-3 text-slate-700"
                            onClick={() => setPricingClientId(client.id)}
                          >
                            Precificação
                          </button>
                          <button type="button" className="text-red-700" disabled={busy} onClick={() => void deactivate(client)}>
                            Desactivar
                          </button>
                        </td>
                      </>
                    )}
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
