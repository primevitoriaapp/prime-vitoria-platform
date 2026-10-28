import { AdminPageHeader } from "@/components/admin-page-header";
import { TenantCompanySettingsForm } from "@/components/tenant-company-settings-form";
import { MessageTemplatesEditor } from "@/components/message-templates-editor";
import { VehicleCategoriesEditor } from "@/components/vehicle-categories-editor";

export default function ConfiguracoesPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Configurações"
        subtitle="Dados da empresa, categorias de veículos e mensagens de WhatsApp"
      />
      <TenantCompanySettingsForm />
      <VehicleCategoriesEditor />
      <MessageTemplatesEditor />
    </div>
  );
}
