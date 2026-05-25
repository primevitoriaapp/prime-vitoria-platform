import Link from "next/link";
import type { Route } from "next";
import { buildAgendaTripHref } from "@/lib/operations/agenda-trip-href";
import { isStagingSmokeHintsEnabled, STAGING_SMOKE_TRIP_REQUESTED_ID } from "@/lib/staging/smoke-hints";

type Props = {
  /** Variante visual: admin claro vs motorista/cliente escuro */
  variant?: "light" | "dark";
};

/**
 * Dica discreta para smoke em staging. OFF por defeito — activar com NEXT_PUBLIC_STAGING_SMOKE_HINTS=true.
 */
export function StagingSmokeHints({ variant = "light" }: Props) {
  if (!isStagingSmokeHintsEnabled()) return null;

  const scheduledAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const agendaHref = buildAgendaTripHref(STAGING_SMOKE_TRIP_REQUESTED_ID, scheduledAt);

  const box =
    variant === "dark"
      ? "border-violet-800/50 bg-violet-950/30 text-violet-100"
      : "border-violet-200 bg-violet-50 text-violet-950";

  return (
    <aside className={`rounded-lg border px-3 py-2 text-xs ${box}`} aria-label="Dica smoke staging">
      <p className="font-medium">Smoke staging</p>
      <p className="mt-1 opacity-90">
        Corrida oficial:{" "}
        <span className="font-mono">{STAGING_SMOKE_TRIP_REQUESTED_ID.slice(0, 8)}…</span> —{" "}
        <Link href={agendaHref as Route} className="font-medium underline">
          Abrir na agenda
        </Link>
        {" · "}
        <Link href="/driver" className="underline">
          Motorista
        </Link>
        {" · "}
        <Link href="/client" className="underline">
          Cliente
        </Link>
      </p>
    </aside>
  );
}
