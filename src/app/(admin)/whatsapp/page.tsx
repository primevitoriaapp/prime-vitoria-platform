import { AdminPageHeader } from "@/components/admin-page-header";
import { WhatsappPanel } from "@/components/whatsapp-panel";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export default async function WhatsappPage() {
  const session = await getSessionContext();
  const tenantId = session.role === "guest" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="WhatsApp"
        subtitle="Mensagens de cada corrida para quem pediu, passageiro e motorista. Os textos ficam em Configurações."
      />
      <WhatsappPanel tenantId={tenantId} />
    </div>
  );
}
