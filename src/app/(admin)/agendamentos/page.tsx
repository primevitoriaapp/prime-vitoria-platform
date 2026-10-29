import { AdminPageHeader } from "@/components/admin-page-header";
import { BookingsBoard } from "@/components/bookings-board";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export default async function AgendamentosPage() {
  const session = await getSessionContext();
  const tenantId = session.role === "guest" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Agendamentos"
        subtitle="Todas as corridas do período. Clique numa corrida para abrir, editar ou definir o motorista."
      />
      <BookingsBoard tenantId={tenantId} />
    </div>
  );
}
