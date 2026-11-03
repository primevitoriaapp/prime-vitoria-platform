import { flightStatusLabel, isFlightProblem } from "@/lib/integrations/flight-status";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

export type FlightInfo = {
  flight_number?: string | null;
  flight_status?: string | null;
  flight_eta?: string | null;
  flight_delay_minutes?: number | null;
  flight_leg?: string | null;
};

/** "✈ LA3345 · pousa 14:40 · +35 min" — vermelho se atrasou 15 min ou mais, cancelou ou desviou. */
export function FlightBadge({ t }: { t: FlightInfo }) {
  if (!t.flight_number) return null;
  const problem = isFlightProblem(t.flight_status);
  const delay = t.flight_delay_minutes ?? 0;
  const late = delay >= 15;
  const verb = t.flight_leg === "departure" ? "decola" : "pousa";
  const landed = /arrived|landed/i.test(t.flight_status ?? "");
  const tone = problem || late ? "bg-red-50 text-red-800 ring-red-200" : "bg-sky-50 text-sky-900 ring-sky-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${tone}`}>
      ✈ {t.flight_number}
      {problem ? ` · ${flightStatusLabel(t.flight_status)}` : null}
      {!problem && t.flight_eta ? ` · ${landed ? "pousou" : verb} ${hhmm(t.flight_eta)}` : null}
      {!problem && delay >= 5 ? ` · +${delay} min` : null}
      {!problem && delay <= -10 ? ` · adiantado ${-delay} min` : null}
    </span>
  );
}
