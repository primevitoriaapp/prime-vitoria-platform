/** Skeleton de carregamento — painel motorista (tablet-friendly). */
export function DriverTripSkeleton() {
  return (
    <ul className="mt-4 space-y-4" aria-busy="true" aria-label="A carregar corridas">
      {[1, 2].map((i) => (
        <li key={i} className="animate-pulse rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <div className="h-5 w-24 rounded bg-slate-700" />
          <div className="mt-3 h-4 w-3/4 rounded bg-slate-800" />
          <div className="mt-2 h-3 w-full rounded bg-slate-800/80" />
          <div className="mt-4 flex gap-2">
            <div className="h-11 min-w-[7rem] flex-1 rounded-lg bg-slate-700" />
            <div className="h-11 min-w-[7rem] flex-1 rounded-lg bg-slate-800" />
          </div>
        </li>
      ))}
    </ul>
  );
}
