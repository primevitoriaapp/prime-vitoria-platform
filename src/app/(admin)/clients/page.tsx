import { ClientsFleetPanel } from "@/components/clients-fleet-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getClients() {
  const response = await fetchInternalApi("/api/clients");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data as Array<{
    id: string;
    name: string;
    type: string;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
    active: boolean;
  }>;
}

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <main>
      <h1>Clientes corporativos</h1>
      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        Cadastro de empresas e pessoas do portal cliente. Desactivar impede novas solicitações com esse cliente.
      </p>
      <ClientsFleetPanel initialClients={clients} />
    </main>
  );
}
