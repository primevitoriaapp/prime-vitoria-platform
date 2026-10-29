import { AdminPageHeader } from "@/components/admin-page-header";
import { VehiclesFleetPanel } from "@/components/vehicles-fleet-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getVehicles() {
  const response = await fetchInternalApi("/api/vehicles");
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => ({ data: [] }))) as { data?: unknown };
  return (payload.data ?? []) as Parameters<typeof VehiclesFleetPanel>[0]["initialVehicles"];
}

export default async function VehiclesPage() {
  const vehicles = await getVehicles();

  return (
    <>
      <AdminPageHeader
        title="Veículos"
        subtitle="Carros da frota e dos parceiros, com categoria e vencimento de seguro, licenciamento e vistoria. O painel avisa antes de vencer."
      />
      <VehiclesFleetPanel initialVehicles={vehicles} />
    </>
  );
}
