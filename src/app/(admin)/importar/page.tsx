import { AdminPageHeader } from "@/components/admin-page-header";
import { SheetImportPanel } from "@/components/sheet-import-panel";

export default function ImportarPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Importar planilha"
        subtitle="Cadastre vários clientes ou motoristas de uma vez, a partir de uma planilha Excel ou CSV."
      />
      <SheetImportPanel />
    </div>
  );
}
