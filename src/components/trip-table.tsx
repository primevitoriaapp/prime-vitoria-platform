import { StatusBadge } from "@/components/status-badge";

export interface TripRow {
  id: string;
  scheduled_at: string;
  origin_text: string;
  destination_text: string;
  operational_status: any;
  dispatch_mode: string;
}

export function TripTable({ trips }: { trips: TripRow[] }) {
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Horario</th>
            <th align="left">Origem</th>
            <th align="left">Destino</th>
            <th align="left">Despacho</th>
            <th align="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => (
            <tr key={trip.id}>
              <td>{new Date(trip.scheduled_at).toLocaleString("pt-BR")}</td>
              <td>{trip.origin_text}</td>
              <td>{trip.destination_text}</td>
              <td>{trip.dispatch_mode}</td>
              <td><StatusBadge status={trip.operational_status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
