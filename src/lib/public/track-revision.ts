export type PublicTrackRevisionInput = {
  operational_status: string;
  location?: { recorded_at?: string | null } | null;
  planned_km?: number | null;
  actual_km?: number | null;
  km_updated_at?: string | null;
};

export const PUBLIC_TRACK_TERMINAL_STATUSES = ["completed", "cancelled", "rejected", "no_show"] as const;

/** Status finais reduzem carga de stream/polling e mantêm o último snapshot visível ao passageiro. */
export function isPublicTrackTerminalStatus(status: string): boolean {
  return (PUBLIC_TRACK_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Cursor estável para saber se o snapshot público mudou entre ciclos de stream/polling. */
export function publicTrackRevision(snapshot: PublicTrackRevisionInput): string {
  return [
    snapshot.operational_status,
    snapshot.location?.recorded_at ?? "",
    snapshot.planned_km ?? "",
    snapshot.actual_km ?? "",
    snapshot.km_updated_at ?? ""
  ].join("|");
}
