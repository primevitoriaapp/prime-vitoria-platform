import { AdminPageHeader } from "@/components/admin-page-header";
import { VehicleCategoriesEditor } from "@/components/vehicle-categories-editor";

export default function CategoriasPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Categorias"
        subtitle="Os tipos de veículo que o cliente escolhe no portal (foto, lugares e descrição). Os preços ficam no cadastro de cada empresa."
      />
      <VehicleCategoriesEditor />
    </div>
  );
}
