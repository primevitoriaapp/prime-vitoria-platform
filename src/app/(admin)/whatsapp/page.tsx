import { AdminPageHeader } from "@/components/admin-page-header";
import { WhatsappTabs } from "@/components/whatsapp-tabs";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

export default async function WhatsappPage() {
  const session = await getSessionContext();
  const tenantId = session.role === "guest" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="WhatsApp"
        subtitle="Conversas do WhatsApp da central (27) 2142-8307 e os avisos de cada corrida."
      />
      <WhatsappTabs tenantId={tenantId} />
    </div>
  );
}
