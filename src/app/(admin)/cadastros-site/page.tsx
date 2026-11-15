import { AdminPageHeader } from "@/components/admin-page-header";
import { SiteLeadsBoard } from "@/components/site-leads-board";

export default function CadastrosSitePage() {
  return (
    <div className="pb-10">
      <AdminPageHeader title="Cadastros do site" subtitle="Motoristas e empresas que se cadastraram em primevitoria.com/seja-motorista e /para-empresas." />
      <SiteLeadsBoard />
    </div>
  );
}
