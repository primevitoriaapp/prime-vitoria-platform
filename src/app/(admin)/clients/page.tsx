import { AdminPageHeader } from "@/components/admin-page-header";
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
    <>
      <AdminPageHeader
        title="Clientes corporativos"
        subtitle="Cadastro PF e PJ · centros de custo · faturamento"
      />
      <ClientsFleetPanel initialClients={clients} />
    </>
  );
}
