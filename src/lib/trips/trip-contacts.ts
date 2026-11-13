/** Pessoas da corrida com quem o motorista pode falar: passageiro principal, embarques e desembarques. */
export type TripContact = { name: string; phone: string | null; role: string };

type StopLike = { passenger_name?: string | null; passenger_phone?: string | null; final?: boolean | null };

function digits(p?: string | null) {
  return String(p ?? "").replace(/\D/g, "");
}

export function tripContacts(trip: {
  passenger_name?: string | null;
  passenger_phone?: string | null;
  trip_pickup_stops?: unknown;
  trip_dropoff_stops?: unknown;
}): TripContact[] {
  const out: TripContact[] = [];
  const seen = new Set<string>();
  const add = (name: string | null | undefined, phone: string | null | undefined, role: string) => {
    const n = String(name ?? "").trim();
    const p = String(phone ?? "").trim() || null;
    if (!n && !p) return;
    const key = digits(p) || n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n || "Passageiro", phone: p, role });
  };
  add(trip.passenger_name, trip.passenger_phone, "Passageiro");
  const pick = Array.isArray(trip.trip_pickup_stops) ? (trip.trip_pickup_stops as StopLike[]) : [];
  pick.forEach((s, i) => add(s.passenger_name, s.passenger_phone, `Embarque ${i + 1}`));
  const drop = Array.isArray(trip.trip_dropoff_stops) ? (trip.trip_dropoff_stops as StopLike[]) : [];
  drop.forEach((s, i) => add(s.passenger_name, s.passenger_phone, s.final ? "Destino final" : `Parada ${i + 1}`));
  return out;
}

/** "Catarina e Marília" quando a corrida não tem passageiro principal. */
export function tripPeopleLabel(trip: Parameters<typeof tripContacts>[0]): string {
  if (trip.passenger_name?.trim()) return trip.passenger_name.trim();
  const names = tripContacts(trip).map((c) => c.name.split(/\s+/)[0]).filter((n) => n && n !== "Passageiro");
  if (!names.length) return "";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
