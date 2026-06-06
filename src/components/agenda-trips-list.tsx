import Link from "next/link";
import type { Route } from "next";
import { StatusBadge } from "@/components/status-badge";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { formatBrTime, tripAgendaDateGroup } from "@/lib/dates/br-date";
import { formatRouteShort } from "@/lib/trips/format-place-label";
import type { TripRow } from "@/components/trip-table";

type DateGroup = "overdue" | "today" | "tomorrow" | "upcoming";

const GROUP_LABEL: Record<DateGroup, string> = {
  overdue: "Atrasadas / anteriores",
  today: "Hoje",
  tomorrow: "Amanhã",
  upcoming: "Próximas"
};

const GROUP_ORDER: DateGroup[] = ["overdue", "today", "tomorrow", "upcoming"];

const STATUS_SORT: Partial<Record<TripOperationalStatus, number>> = {
  requested: 0,
  approved: 1,
  dispatched: 2,
  accepted: 3,
  on_the_way: 4,
  arrived: 5,
  in_progress: 6
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function groupTrips(trips: TripRow[]): Map<DateGroup, TripRow[]> {
  const sorted = [...trips].sort((a, b) => {
    const sa = STATUS_SORT[a.operational_status] ?? 50;
    const sb = STATUS_SORT[b.operational_status] ?? 50;
    if (sa !== sb) return sa - sb;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });
  const map = new Map<DateGroup, TripRow[]>();
  for (const g of GROUP_ORDER) map.set(g, []);
  for (const trip of sorted) {
    const g = tripAgendaDateGroup(trip.scheduled_at);
    map.get(g)!.push(trip);
  }
  return map;
}

type Props = {
  trips: TripRow[];
  operatorNotesHref: (tripId: string) => string;
};

export function AgendaTripsList({ trips, operatorNotesHref }: Props) {
  const grouped = groupTrips(trips);

  if (trips.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
        Nenhuma corrida no período. Ajuste o intervalo de datas ou abra a fila operacional.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {GROUP_ORDER.map((group) => {
        const items = grouped.get(group) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {GROUP_LABEL[group]}
              <span className="ml-2 font-normal normal-case text-slate-400">({items.length})</span>
            </h3>
            <ul className="space-y-3">
              {items.map((trip) => {
                const route = formatRouteShort(trip.origin_text, trip.destination_text);
                const metaParts = [
                  trip.client_name?.trim() || "—",
                  trip.driver_name?.trim() || "Motorista a definir",
                  fmtMoney(trip.client_amount) ?? null
                ].filter(Boolean);

                return (
                  <li key={trip.id}>
                    <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <time
                            dateTime={trip.scheduled_at}
                            className="text-lg font-semibold tabular-nums text-slate-900"
                          >
                            {formatBrTime(trip.scheduled_at)}
                          </time>
                          <StatusBadge status={trip.operational_status} />
                        </div>
                        <p
                          className="text-sm text-slate-800"
                          title={`${trip.origin_text} → ${trip.destination_text}`}
                        >
                          {route}
                        </p>
                        <p className="text-xs text-slate-500">{metaParts.join(" · ")}</p>
                      </div>
                      <div className="shrink-0">
                        <Link
                          href={operatorNotesHref(trip.id) as Route}
                          className="inline-flex w-full min-w-[5.5rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 sm:w-auto"
                        >
                          Abrir
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
