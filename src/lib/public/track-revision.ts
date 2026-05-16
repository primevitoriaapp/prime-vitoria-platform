export type PublicTrackRevisionInput = {
  operational_status: string;
  location?: { recorded_at?: string | null } | null;
  planned_km?: number | null;
  actual_km?: number | null;
  km_updated_at?: string | null;
};

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
