import { KpiCard } from "@/components/kpi-card";
import { LiveMap } from "@/components/live-map";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getData() {
  const response = await fetchInternalApi("/api/reports/operations");
  if (!response.ok) return { totalTrips: 0, completedTrips: 0, activeDrivers: 0 };
  const payload = await response.json();
  return payload.data;
}

export default async function DashboardPage() {
  const data = await getData();

  return (
    <main>
      <h1>Dashboard Operacional</h1>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <KpiCard label="Corridas" value={data.totalTrips} />
        <KpiCard label="Finalizadas" value={data.completedTrips} />
        <KpiCard label="Motoristas ativos" value={data.activeDrivers} />
      </div>
      <h2>Monitoramento em tempo real</h2>
      <LiveMap />
    </main>
  );
}
