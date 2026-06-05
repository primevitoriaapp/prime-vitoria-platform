import Link from "next/link";
import type { Route } from "next";
import { StatusBadge } from "@/components/status-badge";
import { TripTrackingLinkButton } from "@/components/trip-tracking-link-button";
import type { TripOperationalStatus } from "@/lib/domain/types";

export interface TripRow {
  id: string;
  scheduled_at: string;
  origin_text: string;
  destination_text: string;
  operational_status: TripOperationalStatus;
  dispatch_mode: string;
  client_name?: string | null;
  driver_name?: string | null;
}

type TripTableProps = {
  trips: TripRow[];
  /** Se definido, mostra botão Abrir (ex.: agenda). */
  operatorNotesHref?: (tripId: string) => string;
};

function formatSchedule(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return { date: "—", time: "" };
  }
  return {
    date: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };
}

export function TripTable({ trips, operatorNotesHref }: TripTableProps) {
  const showOpen = typeof operatorNotesHref === "function";

  return (
    <div className="space-y-3">
      {trips.length === 0 ? (
        <div className="card py-10 text-center text-sm text-slate-500">
          Nenhuma viagem no período. Ajuste o intervalo de datas na agenda ou abra a fila operacional.
        </div>
      ) : null}

      {trips.map((trip) => {
        const schedule = formatSchedule(trip.scheduled_at);
        return (
          <article
            key={trip.id}
            className="card flex flex-col gap-3 border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="shrink-0 sm:w-28">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{schedule.date}</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{schedule.time}</p>
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-medium leading-snug text-slate-900">
                <span className="block truncate">{trip.origin_text || "—"}</span>
                <span className="text-slate-400" aria-hidden>
                  {" "}
                  →{" "}
                </span>
                <span className="block truncate">{trip.destination_text || "—"}</span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  <span className="text-slate-400">Cliente: </span>
                  {trip.client_name?.trim() || "—"}
                </span>
                <span>
                  <span className="text-slate-400">Motorista: </span>
                  {trip.driver_name?.trim() || "A definir"}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
              <StatusBadge status={trip.operational_status} />
              <div className="flex flex-wrap items-center gap-2">
                <TripTrackingLinkButton tripId={trip.id} />
                {showOpen ? (
                  <Link
                    href={operatorNotesHref(trip.id) as Route}
                    className="inline-flex items-center rounded-lg border border-amber-600/40 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                  >
                    Abrir
                  </Link>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
