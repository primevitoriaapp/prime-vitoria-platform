import { AdminPageHeader } from "@/components/admin-page-header";
import { TenantCompanySettingsForm } from "@/components/tenant-company-settings-form";

export default function ConfiguracoesPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Configurações"
        subtitle="Dados da empresa, logo e informações para documentos"
      />
      <TenantCompanySettingsForm />
    </div>
  );
}
