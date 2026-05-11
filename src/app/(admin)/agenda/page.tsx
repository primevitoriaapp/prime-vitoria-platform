import { TripTable } from "@/components/trip-table";
import { fetchInternalApi } from "@/lib/server/internal-fetch";

async function getTrips() {
  const response = await fetchInternalApi("/api/trips?page=1&pageSize=50");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data.items;
}

export default async function AgendaPage() {
  const trips = await getTrips();

  return (
    <main>
      <h1>Agenda Operacional</h1>
      <TripTable trips={trips} />
    </main>
  );
}
