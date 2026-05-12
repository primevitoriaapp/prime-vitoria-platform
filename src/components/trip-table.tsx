import { StatusBadge } from "@/components/status-badge";
import type { DispatchMode } from "@/lib/domain/types";
import { MODO_DESPACHO_PT } from "@/lib/i18n/pt-br";

export interface TripRow {
  id: string;
  scheduled_at: string;
  origin_text: string;
  destination_text: string;
  operational_status: any;
  dispatch_mode: string;
}

function labelModoDespacho(mode: string): string {
  return mode in MODO_DESPACHO_PT ? MODO_DESPACHO_PT[mode as DispatchMode] : mode;
}

export function TripTable({ trips }: { trips: TripRow[] }) {
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Horário</th>
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
              <td>{labelModoDespacho(trip.dispatch_mode)}</td>
              <td><StatusBadge status={trip.operational_status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
