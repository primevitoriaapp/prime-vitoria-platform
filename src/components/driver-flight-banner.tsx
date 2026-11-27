"use client";

/**
 * Situação do voo no app do motorista (buscar no aeroporto).
 * Verde: no horário · Azul: voando · Vermelho: atrasado / não decolou / desviado · Pousou.
 */
type T = {
  flight_number?: string | null;
  flight_status?: string | null;
  flight_eta?: string | null;
  flight_delay_minutes?: number | null;
  flight_leg?: string | null;
  flight_departed_at?: string | null;
  flight_landed_at?: string | null;
  flight_checked_at?: string | null;
  scheduled_at: string;
};

const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export function DriverFlightBanner({ trip, compact = false }: { trip: T; compact?: boolean }) {
  if (!trip.flight_number || trip.flight_leg === "departure") return null;
  const st = trip.flight_status ?? "";
  const delay = trip.flight_delay_minutes ?? 0;
  const tripAt = new Date(trip.scheduled_at).getTime();
  const checked = Boolean(trip.flight_checked_at);

  let tone = "bg-sky-50 text-sky-900 ring-sky-200";
  let icon = "✈️";
  let line1 = `Voo ${trip.flight_number}`;
  let line2 = "Acompanhamento começa 5 h antes do pouso.";

  if (/diverted/i.test(st)) {
    tone = "bg-red-50 text-red-800 ring-red-200";
    icon = "⚠️";
    line1 = `Voo ${trip.flight_number} pousou em outro aeroporto`;
    line2 = "Aguarde orientação da central.";
  } else if (/arrived/i.test(st)) {
    tone = "bg-emerald-50 text-emerald-900 ring-emerald-200";
    icon = "🛬";
    line1 = `Voo ${trip.flight_number} pousou${trip.flight_landed_at ? ` às ${hm(trip.flight_landed_at)}` : ""}`;
    line2 = "Passageiro deve sair do desembarque em ~15 a 25 min.";
  } else if (/enroute/i.test(st)) {
    const late = delay >= 15;
    tone = late ? "bg-red-50 text-red-800 ring-red-200" : "bg-sky-50 text-sky-900 ring-sky-200";
    icon = late ? "🔴" : "✈️";
    line1 = late ? `VOO ATRASADO ~${delay} min` : `Voo ${trip.flight_number} no ar${trip.flight_departed_at ? ` · decolou ${hm(trip.flight_departed_at)}` : ""}`;
    line2 = trip.flight_eta ? `Pouso previsto ${hm(trip.flight_eta)}${late ? " · o passageiro deve atrasar" : ""}` : "Previsão de pouso em atualização.";
  } else if (checked && Date.now() > tripAt - 40 * 60_000) {
    tone = "bg-red-50 text-red-800 ring-red-200";
    icon = "⚠️";
    line1 = `Voo ${trip.flight_number} ainda não decolou`;
    line2 = "Deve atrasar ou foi cancelado. Aguarde a central.";
  } else if (checked) {
    tone = "bg-emerald-50 text-emerald-900 ring-emerald-200";
    icon = "🟢";
    line1 = `Voo ${trip.flight_number} ainda em solo`;
    line2 = "Você recebe um aviso quando decolar.";
  }

  return (
    <div className={`flex items-start gap-2 rounded-2xl px-3 ${compact ? "py-2" : "py-2.5"} ring-1 ${tone}`}>
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{line1}</span>
        {!compact ? <span className="block text-xs">{line2}</span> : null}
      </span>
    </div>
  );
}
