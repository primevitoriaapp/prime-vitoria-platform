import { AdminPageHeader } from "@/components/admin-page-header";
import { LiveMap } from "@/components/live-map";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export default async function AoVivoPage() {
  const session = await getSessionContext();
  const tenantId = session.role === "guest" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  return (
    <div className="pb-6">
      <AdminPageHeader
        title="Operação ao vivo"
        subtitle="Onde está cada motorista agora. Vermelho ocupado, cinza a caminho, azul corrida em breve, verde livre."
      />
      <LiveMap tenantId={tenantId} variant="full" />
    </div>
  );
}
