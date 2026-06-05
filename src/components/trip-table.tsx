import Link from "next/link";
import type { Route } from "next";
import { StatusBadge } from "@/components/status-badge";
import type { DispatchMode, TripOperationalStatus } from "@/lib/domain/types";
import { MODO_DESPACHO_PT } from "@/lib/i18n/pt-br";

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
  operatorNotesHref?: (tripId: string) => string;
};

function formatSchedule(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function labelModoDespacho(mode: string): string {
  return mode in MODO_DESPACHO_PT ? MODO_DESPACHO_PT[mode as DispatchMode] : mode;
}

function routeLine(origin: string, destination: string): string {
  const o = origin.trim() || "—";
  const d = destination.trim() || "—";
  return `${o} → ${d}`;
}

export function TripTable({ trips, operatorNotesHref }: TripTableProps) {
  const showOpen = typeof operatorNotesHref === "function";

  return (
    <div className="space-y-3">
      {trips.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma viagem no período. Ajuste o intervalo de datas na agenda ou abra a fila operacional.
        </div>
      ) : null}

      {trips.map((trip) => (
        <article
          key={trip.id}
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <time
                dateTime={trip.scheduled_at}
                className="text-base font-semibold tabular-nums text-slate-900"
              >
                {formatSchedule(trip.scheduled_at)}
              </time>
              <StatusBadge status={trip.operational_status} />
            </div>

            <p className="truncate text-sm text-slate-800" title={routeLine(trip.origin_text, trip.destination_text)}>
              {routeLine(trip.origin_text, trip.destination_text)}
            </p>

            <p className="truncate text-xs text-slate-500">
              {trip.client_name?.trim() || "—"}
              <span className="text-slate-300"> · </span>
              {trip.driver_name?.trim() || "Motorista a definir"}
              <span className="text-slate-300"> · </span>
              {labelModoDespacho(trip.dispatch_mode)}
            </p>
          </div>

          {showOpen ? (
            <div className="shrink-0 sm:pl-2">
              <Link
                href={operatorNotesHref(trip.id) as Route}
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 sm:w-auto"
              >
                Abrir
              </Link>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
