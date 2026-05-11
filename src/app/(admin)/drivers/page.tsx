import { EntityCrudPanel } from "@/components/entity-crud-panel";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getDrivers() {
  const response = await fetchInternalApi("/api/drivers");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data as Array<{ id: string; cpf: string; cnh_number?: string; active: boolean }>;
}

export default async function DriversPage() {
  const drivers = await getDrivers();

  return (
    <main>
      <h1>Motoristas</h1>
      <EntityCrudPanel
        title="Novo motorista"
        endpoint="/api/drivers"
        fields={[
          { key: "profile_id", label: "Profile ID", required: true },
          { key: "cpf", label: "CPF", required: true },
          { key: "cnh_number", label: "CNH" },
          { key: "cnh_category", label: "Categoria CNH" },
          { key: "pix_key", label: "Chave PIX" },
          { key: "address", label: "Endereco" }
        ]}
      />
      <section className="card">
        <h2>Motoristas ativos</h2>
        <ul>
          {drivers.map((driver) => (
            <li key={driver.id}>
              CPF {driver.cpf} - CNH {driver.cnh_number ?? "nao informado"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
