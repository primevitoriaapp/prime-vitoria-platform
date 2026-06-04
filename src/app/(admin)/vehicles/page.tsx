import { AdminPageHeader } from "@/components/admin-page-header";
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
    <>
      <AdminPageHeader
        title="Veículos"
        subtitle="Frota corporativa · documentação e status operacional"
      />
      <VehiclesFleetPanel initialVehicles={vehicles} />
    </>
  );
}
