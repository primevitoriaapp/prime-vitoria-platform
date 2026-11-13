import { AdminPageHeader } from "@/components/admin-page-header";
import { TenantCompanySettingsForm } from "@/components/tenant-company-settings-form";

export default function MinhaEmpresaPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader title="Minha empresa" subtitle="Logo, nome, dados, contatos e os e-mails que o sistema usa para falar com os clientes." />
      <TenantCompanySettingsForm />
    </div>
  );
}
