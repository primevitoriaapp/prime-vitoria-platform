import { AdminPageHeader } from "@/components/admin-page-header";
import { ClientsFleetPanel } from "@/components/clients-fleet-panel";
import { listActiveClientsForTenant } from "@/lib/clients/client-db";
import { can } from "@/lib/security/rbac";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export const dynamic = "force-dynamic";

async function getClients() {
  const session = await getSessionContext();
  if (!can(session, "client.read")) return [];
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  try {
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
