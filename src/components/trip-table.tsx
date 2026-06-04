import Link from "next/link";
import type { Route } from "next";
import { StatusBadge } from "@/components/status-badge";
import { TripTrackingLinkButton } from "@/components/trip-tracking-link-button";
import type { DispatchMode } from "@/lib/domain/types";
import { formatBrDateTime } from "@/lib/dates/br-date";
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

type TripTableProps = {
  trips: TripRow[];
  /** Se definido, mostra coluna com ligação para notas operacionais (ex.: agenda). */
  operatorNotesHref?: (tripId: string) => string;
};

export function TripTable({ trips, operatorNotesHref }: TripTableProps) {
  const showNotes = typeof operatorNotesHref === "function";
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
            <th align="left">Rastreio</th>
            {showNotes ? <th align="left">Acções</th> : null}
          </tr>
        </thead>
        <tbody>
          {trips.length === 0 ? (
            <tr>
              <td colSpan={showNotes ? 7 : 6} className="py-8 text-center text-sm text-slate-500">
                Nenhuma viagem no período. Ajuste o intervalo de datas na agenda ou abra a fila operacional.
              </td>
            </tr>
          ) : null}
          {trips.map((trip) => (
            <tr key={trip.id}>
              <td>{formatBrDateTime(trip.scheduled_at)}</td>
              <td>{trip.origin_text}</td>
              <td>{trip.destination_text}</td>
              <td>{labelModoDespacho(trip.dispatch_mode)}</td>
              <td>
                <StatusBadge status={trip.operational_status} />
              </td>
              <td>
                <TripTrackingLinkButton tripId={trip.id} />
              </td>
              {showNotes ? (
                <td>
                  <Link
                    href={operatorNotesHref(trip.id) as Route}
                    className="text-sm font-medium text-amber-700 hover:underline"
                  >
                    Abrir
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
