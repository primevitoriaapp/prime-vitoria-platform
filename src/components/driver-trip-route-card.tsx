type Props = {
  originText: string;
  destinationText: string;
  scheduledLabel?: string;
};

/** Origem e destino legíveis no painel motorista. */
export function DriverTripRouteCard({ originText, destinationText, scheduledLabel }: Props) {
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-sm">
      <div className="flex gap-2">
        <span className="mt-0.5 shrink-0 text-xs font-bold uppercase tracking-wide text-emerald-400">Origem</span>
        <p className="font-medium text-slate-100">{originText}</p>
      </div>
      <div className="flex gap-2 border-t border-slate-800 pt-2">
        <span className="mt-0.5 shrink-0 text-xs font-bold uppercase tracking-wide text-sky-400">Destino</span>
        <p className="font-medium text-slate-100">{destinationText}</p>
      </div>
      {scheduledLabel ? <p className="border-t border-slate-800 pt-2 text-xs text-slate-500">{scheduledLabel}</p> : null}
    </div>
  );
}
