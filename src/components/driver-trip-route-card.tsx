type Props = {
  originText: string;
  destinationText: string;
  scheduledLabel?: string;
};

/** Origem e destino legíveis no painel motorista. */
export function DriverTripRouteCard({ originText, destinationText, scheduledLabel }: Props) {
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-sm">
      <div className="flex min-w-0 gap-2">
        <span className="mt-0.5 shrink-0 text-xs font-bold uppercase tracking-wide text-emerald-400">Origem</span>
        <p className="min-w-0 flex-1 truncate font-medium text-slate-100" title={originText}>
          {originText}
        </p>
      </div>
      <div className="flex min-w-0 gap-2 border-t border-slate-800 pt-2">
        <span className="mt-0.5 shrink-0 text-xs font-bold uppercase tracking-wide text-sky-400">Destino</span>
        <p className="min-w-0 flex-1 truncate font-medium text-slate-100" title={destinationText}>
          {destinationText}
        </p>
      </div>
      {scheduledLabel ? <p className="border-t border-slate-800 pt-2 text-xs text-slate-500">{scheduledLabel}</p> : null}
    </div>
  );
}
