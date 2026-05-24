import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

const FLOW: TripOperationalStatus[] = [
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed"
];

type Props = {
  current: TripOperationalStatus;
};

export function DriverOperationalTimeline({ current }: Props) {
  const idx = FLOW.indexOf(current);
  return (
    <ol
      className="mt-3 flex flex-wrap items-center gap-1 text-xs md:gap-2"
      aria-label="Progresso da corrida"
    >
      {FLOW.map((step, i) => {
        const done = idx >= 0 && i < idx;
        const active = step === current;
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={[
                "inline-flex min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full px-2 text-center font-medium md:min-h-[2.25rem] md:min-w-[2.25rem]",
                active
                  ? "bg-amber-500 text-slate-950 ring-2 ring-amber-300"
                  : done
                    ? "bg-emerald-700/80 text-white"
                    : "bg-slate-800 text-slate-500"
              ].join(" ")}
              title={STATUS_CORRIDA_PT[step]}
            >
              {i + 1}
            </span>
            <span className={active ? "font-semibold text-amber-300" : done ? "text-slate-400" : "text-slate-600"}>
              <span className="hidden sm:inline">{STATUS_CORRIDA_PT[step]}</span>
            </span>
            {i < FLOW.length - 1 ? <span className="mx-0.5 text-slate-600" aria-hidden>→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
