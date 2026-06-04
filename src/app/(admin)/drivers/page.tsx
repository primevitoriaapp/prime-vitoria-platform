import { AdminPageHeader } from "@/components/admin-page-header";
import { DriversFleetPanel } from "@/components/drivers-fleet-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getDrivers() {
  const response = await fetchInternalApi("/api/drivers");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data as Array<{
    id: string;
    cpf: string;
    cnh_number?: string | null;
    default_vehicle?: { id: string; model: string; plate: string } | null;
  }>;
}

export default async function DriversPage() {
  const drivers = await getDrivers();

  return (
    <>
      <AdminPageHeader
        title="Motoristas"
        subtitle="Gestão da frota executiva e documentação"
      />
      <DriversFleetPanel initialDrivers={drivers} />
    </>
  );
}
