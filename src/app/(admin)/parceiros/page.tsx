import { AdminPageHeader } from "@/components/admin-page-header";
import { PartnersPanel } from "@/components/partners-panel";

export default function ParceirosPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Parceiros"
        subtitle="Empresas (CNPJ) e pessoas (CPF) que prestam serviço para a Prime, com os carros e motoristas de cada um."
      />
      <PartnersPanel />
    </div>
  );
}
