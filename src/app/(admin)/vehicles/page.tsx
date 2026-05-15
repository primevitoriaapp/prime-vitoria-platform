import { VehiclesFleetPanel } from "@/components/vehicles-fleet-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getVehicles() {
  const response = await fetchInternalApi("/api/vehicles");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data as Array<{
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
    <main>
      <h1>Veículos</h1>
      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        Cadastro da frota, edição e desactivação. Veículos padrão podem ser vinculados a motoristas na página Motoristas.
      </p>
      <VehiclesFleetPanel initialVehicles={vehicles} />
    </main>
  );
}
