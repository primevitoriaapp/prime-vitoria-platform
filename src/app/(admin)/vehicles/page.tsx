import { EntityCrudPanel } from "@/components/entity-crud-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getVehicles() {
  const response = await fetchInternalApi("/api/vehicles");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data as Array<{ id: string; model: string; plate: string; category?: string }>;
}

export default async function VehiclesPage() {
  const vehicles = await getVehicles();

  return (
    <main>
      <h1>Veiculos</h1>
      <EntityCrudPanel
        title="Novo veiculo"
        endpoint="/api/vehicles"
        fields={[
          { key: "model", label: "Modelo", required: true },
          { key: "plate", label: "Placa", required: true },
          { key: "category", label: "Categoria" },
          { key: "capacity", label: "Capacidade", type: "number" },
          { key: "color", label: "Cor" }
        ]}
      />
      <section className="card">
        <h2>Frota ativa</h2>
        <ul>
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              {vehicle.model} - {vehicle.plate} ({vehicle.category ?? "sem categoria"})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
