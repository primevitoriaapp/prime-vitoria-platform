import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { CLIENT_TRIP_FLOW, clientFlowIndex } from "@/lib/client/client-trip-flow";

type Props = {
  current: TripOperationalStatus;
};

/** Timeline read-only para o portal cliente (sem API operacional). */
export function ClientOperationalTimeline({ current }: Props) {
  const idx = clientFlowIndex(current);
  if (idx < 0) {
    return (
      <p className="mt-2 text-sm text-slate-400">
        Estado actual: <span className="font-medium text-amber-300">{STATUS_CORRIDA_PT[current]}</span>
      </p>
    );
  }

  return (
    <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" aria-label="Estado da corrida">
      {CLIENT_TRIP_FLOW.map((step, i) => {
        const done = i < idx;
        const active = step === current;
        return (
          <li key={step} className="flex items-center gap-2 text-sm">
            <span
              className={[
                "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2 text-xs font-semibold",
                active
                  ? "bg-amber-500 text-slate-950 ring-2 ring-amber-400/80"
                  : done
                    ? "bg-emerald-800/90 text-white"
                    : "bg-slate-800 text-slate-500"
              ].join(" ")}
            >
              {i + 1}
            </span>
            <span className={active ? "font-semibold text-white" : done ? "text-slate-300" : "text-slate-600"}>
              {STATUS_CORRIDA_PT[step]}
            </span>
            {i < CLIENT_TRIP_FLOW.length - 1 ? (
              <span className="hidden text-slate-600 sm:inline" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
