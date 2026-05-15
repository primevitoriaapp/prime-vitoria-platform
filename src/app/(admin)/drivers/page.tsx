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
    <main>
      <h1>Motoristas</h1>
      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        Cadastro de parceiros e veículo padrão usado no despacho automático directo.
      </p>
      <DriversFleetPanel initialDrivers={drivers} />
    </main>
  );
}
