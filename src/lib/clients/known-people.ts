/** Pessoas que já viajaram por um cliente: para preencher sozinho o endereço e o telefone ao digitar o nome. */

export type KnownPerson = { name: string; address: string; lat: number | null; lng: number | null; phone: string | null; source: "cadastro" | "historico" };

type RawStop = { passenger_name?: string | null; passenger_phone?: string | null; address_text?: string | null; pickup_text?: string | null; lat?: number | null; lng?: number | null; pickup_lat?: number | null; pickup_lng?: number | null };

const key = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const addrKey = (a: string) => key(a).replace(/[^a-z0-9]/g, "").slice(0, 40);

/**
 * Junta os nomes das paradas das corridas (mais recentes primeiro). Para cada pessoa fica o endereço que mais se repete
 * (assim, um dia em que a pessoa "ficou no destino do trabalho" não troca o endereço de casa).
 */
export function knownPeopleFromTrips(
  trips: { trip_dropoff_stops?: unknown; trip_pickup_stops?: unknown }[],
  avoidAddresses: string[] = []
): KnownPerson[] {
  const avoid = new Set(avoidAddresses.map(addrKey));
  type Entry = { name: string; phone: string | null; addrs: Map<string, { n: number; first: number; a: RawStop }> };
  const byName = new Map<string, Entry>();
  let order = 0;
  for (const t of trips) {
    const stops = [...(Array.isArray(t.trip_dropoff_stops) ? t.trip_dropoff_stops : []), ...(Array.isArray(t.trip_pickup_stops) ? t.trip_pickup_stops : [])] as RawStop[];
    for (const s of stops) {
      const name = String(s.passenger_name ?? "").trim();
      const address = String(s.address_text ?? s.pickup_text ?? "").trim();
      if (name.length < 2 || address.length < 3 || /^passageiro \d+$/i.test(name)) continue;
      const k = key(name);
      const e: Entry = byName.get(k) ?? { name, phone: null, addrs: new Map() };
      if (!e.phone && s.passenger_phone) e.phone = String(s.passenger_phone);
      const ak = addrKey(address);
      const cur = e.addrs.get(ak);
      if (cur) cur.n += avoid.has(ak) ? 0 : 1;
      else e.addrs.set(ak, { n: avoid.has(ak) ? 0 : 1, first: order++, a: { ...s, address_text: address } });
      byName.set(k, e);
    }
  }
  const out: KnownPerson[] = [];
  for (const e of byName.values()) {
    const best = [...e.addrs.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0];
    if (!best) continue;
    out.push({
      name: e.name,
      address: String(best.a.address_text),
      lat: (best.a.lat ?? best.a.pickup_lat ?? null) as number | null,
      lng: (best.a.lng ?? best.a.pickup_lng ?? null) as number | null,
      phone: e.phone,
      source: "historico"
    });
  }
  return out;
}

/** Acha a pessoa pelo nome digitado (nome completo, ou primeiro nome quando só há uma pessoa com ele). */
export function findKnownPerson(people: KnownPerson[], typed: string): KnownPerson | null {
  const k = key(typed);
  if (k.length < 2) return null;
  const exact = people.find((p) => key(p.name) === k);
  if (exact) return exact;
  const byFirst = people.filter((p) => key(p.name).split(" ")[0] === k);
  return byFirst.length === 1 ? byFirst[0]! : null;
}
