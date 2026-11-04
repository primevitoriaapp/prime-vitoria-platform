/**
 * Pedido com funcionários cadastrados: escolhe as pessoas e o sistema monta o trajeto
 * com o endereço de cada uma. Função pura (testável).
 *  - "buscar": pega cada um em casa e leva todos ao destino (paradas de embarque).
 *  - "levar": sai do local de origem e deixa cada um em casa (paradas de desembarque).
 */
export type TeamMember = { id: string; name: string; phone: string | null; address: string };
export type TeamDirection = "buscar" | "levar";

export type TeamTripShape = {
  originText: string | null;
  destinationText: string | null;
  passengerName: string;
  passengerPhone: string | null;
  passengerCount: number;
  pickupStops: { pickup_text: string; passenger_name: string; passenger_phone: string | null }[] | null;
  dropoffStops: { passenger_id: string; passenger_name: string; address_text: string }[] | null;
};

function firstNames(names: string[]): string {
  const f = names.map((n) => n.trim().split(/\s+/)[0]);
  return f.length <= 1 ? names[0] ?? "" : `${f.slice(0, -1).join(", ")} e ${f[f.length - 1]}`;
}

export function teamTripShape(team: TeamMember[], dir: TeamDirection): TeamTripShape | null {
  const list = team.filter((m) => m.name.trim());
  if (!list.length) return null;
  const withAddr = list.filter((m) => m.address.trim().length >= 3);
  const one = list.length === 1;
  const base = {
    passengerName: one ? list[0].name.trim() : firstNames(list.map((m) => m.name)),
    passengerPhone: list[0].phone,
    passengerCount: list.length
  };
  if (dir === "buscar") {
    return {
      ...base,
      originText: withAddr[0]?.address.trim() ?? null,
      destinationText: null,
      pickupStops: one
        ? null
        : list.map((m) => ({ pickup_text: m.address.trim(), passenger_name: m.name.trim(), passenger_phone: m.phone })),
      dropoffStops: null
    };
  }
  return {
    ...base,
    originText: null,
    destinationText: withAddr[withAddr.length - 1]?.address.trim() ?? null,
    pickupStops: null,
    dropoffStops: one ? null : list.map((m) => ({ passenger_id: m.id, passenger_name: m.name.trim(), address_text: m.address.trim() }))
  };
}

/** Quem está sem endereço (o pedido não pode sair assim). */
export function teamMissingAddress(team: TeamMember[]): string[] {
  return team.filter((m) => m.address.trim().length < 3).map((m) => m.name);
}
