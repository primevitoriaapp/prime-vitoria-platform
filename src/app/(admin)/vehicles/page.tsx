import { AdminPageHeader } from "@/components/admin-page-header";
import { VehiclesFleetPanel } from "@/components/vehicles-fleet-panel";
import { VehicleCategoriesEditor } from "@/components/vehicle-categories-editor";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getVehicles() {
  const response = await fetchInternalApi("/api/vehicles");
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => ({ data: [] }))) as { data?: unknown };
  return (payload.data ?? []) as Array<{
    id: string;
    model: string;
    plate: string;
    category?: string | null;
    capacity?: number | null;
    color?: string | null;
    active: boolean;
  }>;
}

export default async function VehiclesPage() {
  const vehicles = await getVehicles();

  return (
    <>
      <AdminPageHeader
        title="Veículos"
        subtitle="Categorias que o cliente escolhe (com foto e lugares) e a frota cadastrada"
      />
      <VehicleCategoriesEditor />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Frota (carros cadastrados)</h2>
      <VehiclesFleetPanel initialVehicles={vehicles} />
    </>
  );
}
