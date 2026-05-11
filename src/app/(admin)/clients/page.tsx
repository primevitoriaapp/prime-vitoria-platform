import { EntityCrudPanel } from "@/components/entity-crud-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getClients() {
  const response = await fetchInternalApi("/api/clients");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data as Array<{ id: string; name: string; type: string; document?: string; email?: string }>;
}

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <main>
      <h1>Clientes Corporativos</h1>
      <EntityCrudPanel
        title="Novo cliente"
        endpoint="/api/clients"
        fields={[
          { key: "type", label: "Tipo (PF/PJ)", required: true },
          { key: "name", label: "Nome", required: true },
          { key: "document", label: "Documento" },
          { key: "email", label: "Email", type: "email" },
          { key: "phone", label: "Telefone" }
        ]}
      />
      <section className="card">
        <h2>Clientes cadastrados</h2>
        <ul>
          {clients.map((client) => (
            <li key={client.id}>
              {client.name} ({client.type}) - {client.document ?? "sem documento"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
