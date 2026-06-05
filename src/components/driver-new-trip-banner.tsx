"use client";

type Props = {
  origin: string;
  destination: string;
  onDismiss: () => void;
};

export function DriverNewTripBanner({ origin, destination, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 border-b border-amber-400/60 bg-amber-950 px-4 py-3 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Nova corrida</p>
          <p className="mt-1 truncate text-sm font-medium text-white" title={origin}>
            {origin || "—"}
          </p>
          <p className="truncate text-sm text-amber-100/90" title={destination}>
            → {destination || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
