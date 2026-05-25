import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { driverNextStatusLabel } from "@/lib/trips/driver-step-copy";

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
  variant?: "default" | "hero";
};

export function DriverOperationalTimeline({ current, variant = "default" }: Props) {
  const idx = FLOW.indexOf(current);
  const nextLabel = driverNextStatusLabel(current);

  if (variant === "hero") {
    return (
      <div className="mt-4" aria-label="Progresso da corrida">
        <ol className="flex flex-col gap-1 border-l-2 border-slate-700 pl-3">
          {FLOW.map((step, i) => {
            const done = idx >= 0 && i < idx;
            const active = step === current;
            if (!done && !active && i > idx + 1) return null;
            return (
              <li
                key={step}
                className={[
                  "text-sm",
                  active ? "font-semibold text-amber-300" : done ? "text-emerald-400/90" : "text-slate-600"
                ].join(" ")}
              >
                <span className="mr-2 font-mono text-xs text-slate-500">{i + 1}.</span>
                {STATUS_CORRIDA_PT[step]}
                {active && nextLabel ? (
                  <span className="mt-0.5 block text-xs font-normal text-amber-200/80">
                    Próximo: {nextLabel}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

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
            <span
              className={[
                "max-w-[5.5rem] truncate text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs",
                active ? "text-amber-300" : done ? "text-slate-400" : "text-slate-600"
              ].join(" ")}
              title={STATUS_CORRIDA_PT[step]}
            >
              {STATUS_CORRIDA_PT[step]}
            </span>
            {i < FLOW.length - 1 ? <span className="mx-0.5 text-slate-600" aria-hidden>→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
