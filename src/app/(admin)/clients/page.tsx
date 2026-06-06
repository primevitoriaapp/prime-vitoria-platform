import { AdminPageHeader } from "@/components/admin-page-header";
import { ClientsFleetPanel } from "@/components/clients-fleet-panel";
import { listActiveClientsForTenant } from "@/lib/clients/client-db";
import { assertCapability } from "@/lib/security/rbac";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

async function getClients() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const tenantId = assertTenantScope(session);
    return await listActiveClientsForTenant(tenantId);
  } catch {
    return [];
  }
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
