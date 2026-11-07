import { AdminPageHeader } from "@/components/admin-page-header";
import { DriverMessagesPanel } from "@/components/driver-messages-panel";

export default function DriverMessagesPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Avisos para motoristas"
        subtitle="Mande um recado que aparece dentro do app do motorista (com aviso no celular). Veja quem leu e quem respondeu que está disponível."
      />
      <DriverMessagesPanel />
    </div>
  );
}
